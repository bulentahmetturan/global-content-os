"""Hekimler Opportunity Pack — map existing faculty/curator inventory (registry-only)."""
from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
PACK_PATH = ROOT / "content" / "policies" / "hekimler-opportunity-pack.json"
OFFICIAL_SOURCES_YAML = ROOT / "sources" / "official_sources.yaml"

CONGRESS_TERMS = (
    "kongre",
    "congress",
    "sempozyum",
    "symposium",
    "abstract",
    "bildiri",
    "erken kayıt",
)


def load_opportunity_pack(path: Path | None = None) -> dict[str, Any]:
    p = path or PACK_PATH
    data = json.loads(p.read_text(encoding="utf-8"))
    if data.get("pipeline_wiring_enabled") is not False:
        raise ValueError("opportunity pack must keep pipeline_wiring_enabled false")
    return data


def opportunity_inventory_dependency_ok() -> tuple[bool, str]:
    if not OFFICIAL_SOURCES_YAML.is_file():
        return False, f"missing dependency: {OFFICIAL_SOURCES_YAML}"
    return True, str(OFFICIAL_SOURCES_YAML)


def load_faculty_announcement_refs() -> list[dict[str, Any]]:
    """Reference existing YAML rows by id — do not recreate the faculty list."""
    ok, msg = opportunity_inventory_dependency_ok()
    if not ok:
        raise FileNotFoundError(msg)
    try:
        import yaml  # type: ignore
    except ImportError as exc:
        raise RuntimeError("PyYAML required to read official_sources.yaml") from exc
    data = yaml.safe_load(OFFICIAL_SOURCES_YAML.read_text(encoding="utf-8"))
    sources = data.get("sources") if isinstance(data, dict) else data
    refs = []
    for s in sources or []:
        if s.get("category") != "faculty_announcement":
            continue
        refs.append(
            {
                "id": s["id"],
                "name": s.get("name"),
                "url": s.get("url"),
                "institution": s.get("institution"),
                "official": s.get("official"),
                "source_class": classify_source_class(s),
            }
        )
    return refs


def classify_source_class(row: dict[str, Any]) -> str:
    sid = str(row.get("id") or "")
    url = (row.get("url") or "").lower()
    is_ig = (
        "instagram.com" in url
        or sid.startswith("ig_")
        or sid in {"antbat_ankara", "ivsa_ankara"}
    )
    if is_ig:
        return "CURATOR_DISCOVERY"
    if sid.startswith("tip_"):
        return "OFFICIAL_MEDICAL_FACULTY"
    return "OFFICIAL_UNIVERSITY_MEDICAL_UNIT"


@dataclass
class OpportunityDecision:
    route: str
    verification_status: str
    publication_eligible: bool
    reason: str
    handoff_target: str | None = None
    viral_signal: str = "ignored_for_opportunity_ranking"


def _parse_deadline(deadline: str | None) -> date | None:
    if not deadline:
        return None
    raw = deadline.strip()
    try:
        return date.fromisoformat(raw[:10])
    except ValueError:
        pass
    for fmt in ("%d.%m.%Y", "%Y-%m-%dT%H:%M:%SZ"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    return None


def classify_opportunity(
    *,
    title: str,
    source_class: str,
    official_source_url: str | None,
    eligibility_requirements: str | None,
    deadline: str | None,
    application_url: str | None,
    opportunity_type: str | None = None,
    today: date | None = None,
) -> OpportunityDecision:
    blob = (title or "").casefold()
    if any(t in blob for t in CONGRESS_TERMS):
        return OpportunityDecision(
            route="DISCARD",
            verification_status="REJECTED",
            publication_eligible=False,
            reason="congress/symposium content — hand off, do not publish in opportunity pack",
            handoff_target="CONGRESS_REGISTRY",
        )

    generic = ("rektör", "tören", "açılış tören", "kampüs etkinlik", "mezuniyet tören")
    if any(g in blob for g in generic) and not opportunity_type:
        return OpportunityDecision(
            "DISCARD",
            "REJECTED",
            False,
            "generic university news / ceremony discarded",
        )

    if source_class == "CURATOR_DISCOVERY" and not official_source_url:
        return OpportunityDecision(
            "NEEDS_REVIEW",
            "CURATOR_SIGNAL_PENDING_VERIFICATION",
            False,
            "curator signal without official link cannot route to OPPORTUNITY",
        )

    dl = _parse_deadline(deadline)
    if dl is not None and (today or date.today()) > dl:
        return OpportunityDecision("DISCARD", "EXPIRED", False, "expired opportunity excluded")

    if not eligibility_requirements or not deadline or not application_url:
        return OpportunityDecision(
            "NEEDS_REVIEW",
            "INSUFFICIENT_INFORMATION",
            False,
            "missing eligibility, deadline or application path — not publication eligible",
        )

    if source_class in {"OFFICIAL_MEDICAL_FACULTY", "OFFICIAL_UNIVERSITY_MEDICAL_UNIT"} and official_source_url:
        return OpportunityDecision(
            "OPPORTUNITY",
            "OFFICIAL_VERIFIED",
            False,  # still not auto-publish; pack is configured_not_wired
            "official medical-faculty/university opportunity — routes to OPPORTUNITY",
        )

    return OpportunityDecision(
        "NEEDS_REVIEW",
        "INSUFFICIENT_INFORMATION",
        False,
        "insufficient for OPPORTUNITY",
    )


def viral_cannot_change_opportunity_rank(viral_signal: int, base_rank_key: tuple) -> tuple:
    """Viral score must not alter opportunity ranking keys."""
    return base_rank_key  # intentionally ignore viral_signal
