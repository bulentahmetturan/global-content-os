"""Trusted Trend Radar + Question Demand Radar — policy classifiers only.

No fetchers, queues, schedulers or publishing.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
POLICY_PATH = (
    ROOT / "content" / "policies" / "hekimler-trusted-trend-question-demand-policy.json"
)

TRUSTED_TREND_CLASSES = frozenset(
    {
        "OFFICIAL_PRIMARY",
        "PROFESSIONAL_BODY",
        "PROFESSIONAL_GUIDANCE",
        "PRIMARY_SCIENTIFIC",
        "EVIDENCE_INDEX",
        "HIGH_QUALITY_EDITORIAL_PREAPPROVED",
    }
)

DEMAND_ONLY_CLASSES = frozenset(
    {
        "social_post",
        "google_trends",
        "reddit",
        "forum",
        "forum_discussion",
        "comment",
        "social_comment",
        "consumer_health_article",
        "popular_health_media",
        "turkish_search_trend",
        "dm",
        "dm_aggregate",
        "QUESTION_DEMAND_SIGNAL",
    }
)

EVIDENCE_FILE_FIELDS = (
    "normalized_question",
    "why_the_question_matters",
    "audience_segments",
    "demand_signal_urls",
    "primary_urls",
    "evidence_type",
    "publication_status",
    "practical_answer",
    "limitations",
    "uncertainty_level",
    "risk_flags",
    "last_verified_at",
)


def load_trend_demand_policy(path: Path | None = None) -> dict[str, Any]:
    data = json.loads((path or POLICY_PATH).read_text(encoding="utf-8"))
    if data.get("pipeline_wiring_enabled") is not False:
        raise ValueError("trend/demand policy must keep pipeline_wiring_enabled false")
    if data.get("auto_publish") is not False:
        raise ValueError("trend/demand policy must keep auto_publish false")
    return data


@dataclass
class TrendDemandDecision:
    route: str
    output_level: str | None
    publication_eligible: bool
    reason: str
    may_create_trend_candidate: bool = False


def classify_trend_candidate(
    *,
    source_class: str,
    primary_url: str | None,
    official_social_pointer: bool = False,
    topic_relevant_to_medicine: bool = True,
) -> TrendDemandDecision:
    """Only trusted classes with an independent primary URL may create a Trend Candidate."""
    if not topic_relevant_to_medicine:
        return TrendDemandDecision("DISCARD", None, False, "not relevant to medical audience")

    if source_class in DEMAND_ONLY_CLASSES:
        return TrendDemandDecision(
            "QUESTION_BRIEF",
            "QUESTION_BRIEF",
            False,
            "demand/social/consumer signal cannot create a Trend Candidate by itself",
            may_create_trend_candidate=False,
        )

    if source_class not in TRUSTED_TREND_CLASSES:
        return TrendDemandDecision(
            "DISCARD",
            None,
            False,
            "source class not pre-approved for Trusted Trend Radar",
        )

    if not primary_url:
        if official_social_pointer:
            return TrendDemandDecision(
                "NEEDS_REVIEW",
                None,
                False,
                "official social may point to a topic, but official/primary URL is still required",
            )
        return TrendDemandDecision(
            "NEEDS_REVIEW",
            None,
            False,
            "Trend Candidate requires independent primary_url",
        )

    return TrendDemandDecision(
        "TREND_CANDIDATE",
        None,
        False,
        "trusted source with independent primary URL — still not auto-publishable",
        may_create_trend_candidate=True,
    )


def classify_question_demand(
    *,
    signal_class: str,
    normalized_question: str | None,
    audience_segments: list[str] | None = None,
) -> TrendDemandDecision:
    """Demand signals answer only what people are asking — never truth or importance."""
    if signal_class not in DEMAND_ONLY_CLASSES:
        return TrendDemandDecision(
            "DISCARD",
            None,
            False,
            "not an allowed Question Demand signal class",
        )
    if not normalized_question or not str(normalized_question).strip():
        return TrendDemandDecision(
            "NEEDS_REVIEW",
            "QUESTION_BRIEF",
            False,
            "demand signal missing normalized question",
        )
    if not audience_segments:
        return TrendDemandDecision(
            "NEEDS_REVIEW",
            "QUESTION_BRIEF",
            False,
            "target audience required",
        )
    return TrendDemandDecision(
        "QUESTION_BRIEF",
        "QUESTION_BRIEF",
        False,
        "Question Demand Signal → QUESTION_BRIEF only; never publishable trend",
    )


def promote_question_to_evidence(
    *,
    normalized_question: str,
    primary_urls: list[str] | None,
    evidence_supported: bool,
    evidence_weak_or_conflicting: bool = False,
    evidence_file_fields: dict[str, Any] | None = None,
    complexity: str = "brief",  # card | brief | file
) -> TrendDemandDecision:
    """QUESTION → Evidence File rule. Never invent answers from demand signals."""
    if not normalized_question.strip():
        return TrendDemandDecision("DISCARD", None, False, "empty question")

    if evidence_weak_or_conflicting or not evidence_supported or not primary_urls:
        return TrendDemandDecision(
            "DISCARD" if not primary_urls else "NEEDS_REVIEW",
            "QUESTION_BRIEF",
            False,
            "weak/unavailable evidence — do not fill gap with social claims",
        )

    fields = evidence_file_fields or {}
    missing = [k for k in EVIDENCE_FILE_FIELDS if not fields.get(k)]
    if complexity == "file" and missing:
        return TrendDemandDecision(
            "NEEDS_REVIEW",
            "EVIDENCE_FILE",
            False,
            f"Evidence File missing fields: {', '.join(missing)}",
        )

    if complexity == "card":
        level = "VERIFIED_ANSWER_CARD"
    elif complexity == "file":
        level = "EVIDENCE_FILE"
    else:
        level = "EVIDENCE_BRIEF"

    return TrendDemandDecision(
        level,
        level,
        False,
        "supported by independent primary/scientific/official evidence — editorial review still required",
    )


def evidence_file_complete(fields: dict[str, Any]) -> tuple[bool, list[str]]:
    missing = [k for k in EVIDENCE_FILE_FIELDS if not fields.get(k)]
    return len(missing) == 0, missing
