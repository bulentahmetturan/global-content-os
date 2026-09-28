"""Hekimler research / medical-AI / consumer-media evidence policy (registry-only).

No fetchers, schedules, queue wiring or publishing.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
POLICY_PATH = ROOT / "content" / "policies" / "hekimler-research-medical-ai-policy.json"

# Sibling Kaduse research registry (channel-content-os)
KADUSE_RESEARCH_REGISTRY = (
    ROOT.parents[2] / "channel-content-os" / "mcp-server" / "src" / "research" / "source-registry.ts"
)

WATCH_ONLY_DESIGNS = frozenset(
    {"case_series", "case_report", "in_vitro", "animal_study", "modeling_study"}
)
DISCARD_PUBLICATION_STATUS = frozenset({"retracted", "withdrawn"})
CONSUMER_DISCOVERY_IDS = frozenset(
    {"healthline_discovery", "webmd_discovery", "medical_news_today_discovery"}
)


def load_research_policy(path: Path | None = None) -> dict[str, Any]:
    p = path or POLICY_PATH
    data = json.loads(p.read_text(encoding="utf-8"))
    if data.get("pipeline_wiring_enabled") is not False:
        raise ValueError("research policy must keep pipeline_wiring_enabled false")
    if data.get("fetch_enabled") is not False:
        raise ValueError("research policy must keep fetch_enabled false")
    return data


def kaduse_registry_dependency_ok() -> tuple[bool, str]:
    if not KADUSE_RESEARCH_REGISTRY.is_file():
        return False, f"missing dependency: {KADUSE_RESEARCH_REGISTRY}"
    return True, str(KADUSE_RESEARCH_REGISTRY)


def extract_kaduse_source_ids_from_ts(text: str) -> list[str]:
    return re.findall(r"sourceId:\s*'([^']+)'", text)


def referenced_kaduse_ids(policy: dict[str, Any] | None = None) -> list[str]:
    pol = policy or load_research_policy()
    return list(pol["kaduse_research_evidence_bundle"]["referenced_source_ids"])


def verify_kaduse_bundle_references(policy: dict[str, Any] | None = None) -> tuple[bool, str]:
    """Ensure bundle references existing Kaduse IDs and does not include excluded roles."""
    ok, msg = kaduse_registry_dependency_ok()
    if not ok:
        return False, msg
    pol = policy or load_research_policy()
    text = KADUSE_RESEARCH_REGISTRY.read_text(encoding="utf-8")
    available = set(extract_kaduse_source_ids_from_ts(text))
    refs = referenced_kaduse_ids(pol)
    missing = [r for r in refs if r not in available]
    if missing:
        return False, f"referenced IDs not in Kaduse registry: {missing}"
    excluded = set(pol["kaduse_research_evidence_bundle"]["exclude_source_ids"])
    leaked = [r for r in refs if r in excluded]
    if leaked:
        return False, f"excluded discovery/media IDs leaked into bundle: {leaked}"
    # Bundle must not duplicate by inventing new IDs outside Kaduse
    return True, f"ok:{len(refs)}_refs"


@dataclass
class ResearchDecision:
    route: str
    feed_eligible: bool
    publication_eligible: bool
    reason: str
    clinically_ready: bool = False


def classify_research_candidate(
    *,
    study_design: str,
    publication_status: str,
    limitations: str | None,
    practical_significance: str | None,
    primary_url: str | None,
    index_url: str | None = None,
    pmid: str | None = None,
    relevant_to_medicine: bool = True,
) -> ResearchDecision:
    if publication_status in DISCARD_PUBLICATION_STATUS:
        return ResearchDecision("DISCARD", False, False, "retracted/withdrawn — never positive evidence")

    if not relevant_to_medicine:
        return ResearchDecision("DISCARD", False, False, "not relevant to medical audience")

    if publication_status == "preprint":
        return ResearchDecision(
            "RESEARCH_WATCH",
            False,
            False,
            "preprint — RESEARCH_WATCH/NEEDS_REVIEW only; feed_eligible false",
        )

    if study_design in WATCH_ONLY_DESIGNS:
        return ResearchDecision(
            "RESEARCH_WATCH",
            False,
            False,
            "animal/in-vitro/case series/report/modeling — no generalized clinical claim",
        )

    if not limitations or not practical_significance:
        return ResearchDecision("NEEDS_REVIEW", False, False, "limitations and practical_significance required")

    if not primary_url and not (index_url and pmid):
        return ResearchDecision("NEEDS_REVIEW", False, False, "primary evidence or PubMed-indexed record required")

    if study_design == "unknown" or publication_status == "unknown":
        return ResearchDecision("NEEDS_REVIEW", False, False, "unknown design/status needs editorial verification")

    if study_design == "randomized_controlled_trial" and publication_status in {
        "peer_reviewed_published",
        "ahead_of_print",
    }:
        return ResearchDecision("RESEARCH_REVIEW", False, False, "published RCT eligible for RESEARCH_REVIEW")

    return ResearchDecision("RESEARCH_REVIEW", False, False, "research review with evidence attached")


def classify_medical_ai(
    *,
    validation_type: str,
    external_validation_present: bool,
    prospective_validation_present: bool,
    deployment_status: str | None = None,
    regulatory_status: str | None = None,
) -> ResearchDecision:
    if validation_type == "internal_only" or not external_validation_present:
        return ResearchDecision(
            "AI_REVIEW",
            False,
            False,
            "internal/no external validation — not clinically ready",
            clinically_ready=False,
        )
    if not prospective_validation_present and validation_type not in {
        "prospective_validation",
        "randomized_clinical_evaluation",
    }:
        return ResearchDecision(
            "AI_REVIEW",
            False,
            False,
            "promising but not ready for routine clinical use",
            clinically_ready=False,
        )
    return ResearchDecision(
        "AI_REVIEW",
        False,
        False,
        "externally validated, but patient-outcome evidence may still be limited",
        clinically_ready=False,  # never imply readiness from validation alone
    )


def classify_consumer_media(
    *,
    source_id: str,
    primary_url: str | None,
    primary_supports_claim: bool | None = None,
) -> ResearchDecision:
    if source_id not in CONSUMER_DISCOVERY_IDS:
        return ResearchDecision("DISCARD", False, False, "not an approved consumer discovery source")
    if not primary_url or primary_supports_claim is not True:
        return ResearchDecision("DISCARD", False, False, "consumer media without verified primary evidence")
    return ResearchDecision(
        "TREND_INBOX",
        False,
        False,
        "discovery only — consumer article cannot be primary_url or FEED",
    )


def pubmed_record_complete(fields: dict[str, Any]) -> tuple[bool, list[str]]:
    required = ["PMID", "publication_status", "study_design"]
    missing = [k for k in required if not fields.get(k)]
    return len(missing) == 0, missing


def research_provenance_ok(fields: dict[str, Any]) -> tuple[bool, list[str]]:
    needed = ["primary_url", "index_url", "limitations"]
    missing = [k for k in needed if not fields.get(k)]
    # DOI or PMID when available is preferred; at least one index identifier
    if not fields.get("DOI") and not fields.get("PMID"):
        missing.append("DOI_or_PMID")
    return len(missing) == 0, missing
