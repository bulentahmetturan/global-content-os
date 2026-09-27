"""Hekimler Abroad Career — registry load + editorial classification (policy-only).

No fetchers, queues, schedulers or publishing.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
REGISTRY_PATH = ROOT / "content" / "source-registry-abroad-career-v1.json"
POLICY_PATH = ROOT / "content" / "policies" / "hekimler-abroad-career-policy.json"

PATHWAY_STAGES = frozenset(
    {
        "degree_recognition",
        "credential_verification",
        "language_requirement",
        "exam_or_assessment",
        "residency_or_match",
        "registration_or_licensure",
        "specialty_recognition",
        "official_research_or_clinical_training",
    }
)

DISCARD_PATTERNS = (
    "medical school admission",
    "undergraduate admission",
    "üniversite sıralama",
    "university ranking",
    "tuition",
    "lifestyle",
    "work visa agent",
    "immigration package",
    "göçmenlik paketi",
    "recruiter",
    "job agency",
    "iş ajansı",
    "consultancy",
    "danışmanlık paketi",
    "influencer",
    "blog advice",
    "blog tavsiye",
    "garanti kabul",
    "easy pathway",
    "kolay ülke",
    "best country",
    "en iyi ülke",
)

AUTO_ACCEPT_CLAIMS = (
    "turkish diploma is accepted",
    "turkish diploma is automatically",
    "diploma automatically recognised",
    "diploma automatically recognized",
    "otomatik tanınma",
    "her türk diploması kabul",
    "automatically accepted",
)


def load_abroad_career_registry(path: Path | None = None) -> dict[str, Any]:
    p = path or REGISTRY_PATH
    data = json.loads(p.read_text(encoding="utf-8"))
    if data.get("registryId") != "hekimler-abroad-career-v1":
        raise ValueError("unexpected abroad career registryId")
    # Registry document stays unwired by default; individual sources may opt into
    # AUTOMATION_READY with verified list surfaces (still never publication_eligible).
    if data.get("pipeline_wiring_enabled") is not False:
        raise ValueError("abroad career must keep pipeline_wiring_enabled false")
    sources = data.get("sources") or []
    ids = [s["source_id"] for s in sources]
    if len(ids) != len(set(ids)):
        raise ValueError("duplicate abroad source_id")
    for src in sources:
        if src.get("source_tier") != "OFFICIAL_PRIMARY":
            raise ValueError(f"{src.get('source_id')}: must be OFFICIAL_PRIMARY")
        if src.get("publication_eligible") is not False:
            raise ValueError(f"{src.get('source_id')}: publication_eligible must be false")
        if not str(src["source_id"]).startswith("abroad_"):
            raise ValueError("abroad source_ids must use abroad_ prefix to avoid collisions")
        ready = (src.get("runtime_activation") or "").strip().upper() == "AUTOMATION_READY"
        if ready:
            for flag in (
                "fetch_enabled",
                "scheduled_fetch_enabled",
                "candidate_emission_enabled",
                "pipeline_wiring_enabled",
            ):
                if src.get(flag) is not True:
                    raise ValueError(f"{src.get('source_id')}: AUTOMATION_READY requires {flag}=true")
            plan = src.get("fetch_plan") or {}
            if plan.get("primary_method") != "list-page":
                raise ValueError(f"{src.get('source_id')}: AUTOMATION_READY requires list-page fetch_plan")
            if not (src.get("include_keywords") or src.get("exclude_keywords")):
                raise ValueError(f"{src.get('source_id')}: AUTOMATION_READY requires keyword policy gate")
        else:
            for flag in (
                "fetch_enabled",
                "scheduled_fetch_enabled",
                "candidate_emission_enabled",
                "pipeline_wiring_enabled",
            ):
                if src.get(flag) is not False:
                    raise ValueError(f"{src.get('source_id')}: {flag} must be false until AUTOMATION_READY")
    return data


def load_abroad_career_policy(path: Path | None = None) -> dict[str, Any]:
    data = json.loads((path or POLICY_PATH).read_text(encoding="utf-8"))
    if data.get("auto_publish") is not False:
        raise ValueError("abroad policy must keep auto_publish false")
    return data


@dataclass
class AbroadDecision:
    route: str
    editorial_object: str | None
    publication_eligible: bool
    reason: str
    jurisdiction_ok: bool = True


def _fold(text: str) -> str:
    return (text or "").casefold()


def classify_abroad_item(
    *,
    title: str,
    country: str,
    pathway_stage: str | None,
    official_source_url: str | None,
    primary_url: str | None = None,
    jurisdiction: str | None = None,
    opportunity_named: bool = False,
    eligibility: str | None = None,
    deadline: str | None = None,
    watch_only_country: bool = False,
) -> AbroadDecision:
    blob = _fold(title)

    if any(p in blob for p in AUTO_ACCEPT_CLAIMS):
        return AbroadDecision(
            "DISCARD",
            None,
            False,
            "unsupported automatic Turkish-diploma acceptance claim",
            jurisdiction_ok=False,
        )

    if any(p in blob for p in DISCARD_PATTERNS):
        return AbroadDecision("DISCARD", None, False, "non-pathway content (admissions/ranking/recruiter/etc.)")

    if not official_source_url and not primary_url:
        return AbroadDecision("NEEDS_REVIEW", None, False, "missing official primary URL")

    if pathway_stage and pathway_stage not in PATHWAY_STAGES:
        return AbroadDecision("NEEDS_REVIEW", None, False, "unknown pathway_stage")

    country_l = _fold(country)
    needs_jurisdiction = country_l in {"canada", "germany", "spain", "italy"}
    if needs_jurisdiction and not (jurisdiction and jurisdiction.strip()):
        return AbroadDecision(
            "NEEDS_REVIEW",
            None,
            False,
            f"{country} requires province/Land/region/competent-authority context",
            jurisdiction_ok=False,
        )

    if watch_only_country or country_l in {"saudi arabia", "saudi", "gulf", "uae", "qatar", "kuwait"}:
        return AbroadDecision(
            "ABROAD_WATCH_ONLY",
            "OFFICIAL_CHANGE",
            False,
            "Saudi/Gulf official material routes to ABROAD_WATCH_ONLY only",
        )

    if opportunity_named:
        if not eligibility or not deadline:
            return AbroadDecision(
                "NEEDS_REVIEW",
                "OFFICIAL_OPPORTUNITY",
                False,
                "named opportunity missing eligibility or deadline",
            )
        return AbroadDecision(
            "ABROAD_OPPORTUNITY_WATCH",
            "OFFICIAL_OPPORTUNITY",
            False,
            "named official postgraduate medical opportunity",
        )

    # Valid physician-pathway update / evergreen route
    if pathway_stage:
        obj = "OFFICIAL_CHANGE" if re.search(r"change|deadline|update|güncell|değiş", blob) else "OFFICIAL_PATHWAY_DOSSIER"
        return AbroadDecision(
            "ABROAD_CAREER",
            obj,
            False,
            "verified official physician-pathway material",
            jurisdiction_ok=True,
        )

    return AbroadDecision("NEEDS_REVIEW", None, False, "unclear physician pathway relevance")
