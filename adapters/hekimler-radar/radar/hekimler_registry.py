"""Hekimler Topluluğu Source Registry Phase 1 — load + medical keyword gate.

Smallest compatible addition beside the existing radar Source YAML loader.
Does not crawl whole institutions; profiles are medically scoped and gated.
"""
from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_REGISTRY_PATH = ROOT / "content" / "source-registry-phase1.json"
V11_REGISTRY_PATH = ROOT / "content" / "source-registry-v1.1.json"

PHASE1_ROUTES = frozenset(
    {
        "OPPORTUNITY",
        "CAREER",
        "EDUCATION",
        "PROFESSIONAL_BRIEF",
        "PUBLIC_HEALTH",
        "DATA_INSIGHT",
        "NEEDS_REVIEW",
        "DISCARD",
    }
)

V11_ROUTES = PHASE1_ROUTES | frozenset({"CLINICAL_UPDATE"})

ORGANISATION_POSITION_IDS = frozenset({"ttb_national", "hasuder_public_health"})

# Abroad-career sources (source_id prefix "abroad_") track pathway info a Turkish physician could
# act on: scholarships, education programs, registration/exam/licensing steps. They must NOT pass
# routine local disciplinary/enforcement/court news just because it shares licensing-adjacent
# vocabulary ("registration", "medical practitioner") -- a story about a local regulator penalising
# an unregistered person has zero relevance to a Turkish applicant. User correction 2026-09-24
# (repeated after an AHPRA "unregistered doctor penalised" item leaked through): scope is Turkish-
# audience actionable opportunity/pathway info, not what locals/nationals do among themselves.
# Applied centrally here (not per-source exclude_keywords) so it covers every abroad_* source,
# present and future, without relying on each one's own keyword list to remember it.
ABROAD_LOCAL_NOISE_EXCLUDE_KEYWORDS = (
    "penalis",
    "penalt",
    "fined",
    "fine of",
    "convicted",
    "conviction",
    "guilty",
    "offence",
    "offense",
    "misconduct",
    "impersonat",
    "false claim",
    "falsely calling",
    "calling himself",
    "calling herself",
    "unregistered",
    "unlicensed",
    "unqualified",
    "newsletter",
    "bulletin",
    "digest",
    "illuminator",
)

# 2026-09-24: an ever-growing exclude list is reactive (a new bad shape gets added every time the
# user flags one more example -- disciplinary language, then newsletters, then "letter to the
# community", ...). Flipped to a positive requirement instead: for abroad_* sources, content must
# show a concrete, Turkish-applicant-actionable opportunity signal (a scholarship, a free resource,
# an application/registration window, a deadline, a webinar to attend) -- not just pathway-adjacent
# vocabulary. A regulatory/administrative change in how the exam/registration body runs itself
# (e.g. "USMLE to Transition to Limited Testing Dates Each Year Starting in 2028") is real, can be
# significant, and can still sit around for months unreviewed -- but it is not itself something a
# Turkish applicant can act on today, so it doesn't pass this gate even though it's well-written and
# not local disciplinary noise. User's own framing: this is still "local" (about how that country's
# system runs), same category as a local regulation, even when it's forward-looking and important.
ABROAD_OPPORTUNITY_SIGNAL_KEYWORDS = (
    "scholarship",
    "burs",
    "fellowship",
    "grant",
    "free ",
    "ücretsiz",
    "ucretsiz",
    "no cost",
    "webinar",
    "register",
    "registration is open",
    "registration opens",
    "now open",
    "now available",
    "opens on",
    "opening of applications",
    "application",
    "apply now",
    "apply for",
    "apply by",
    "deadline",
    "scheduling is now open",
    "now accepting",
    "more accessible",
    "affordable",
    "discount",
    "reduced fee",
    "reduced cost",
    # abroad_* sources span several languages (Italy, Spain, Germany, Netherlands registries) --
    # opportunity vocabulary must be checked in each, not just English/Turkish.
    "borsa di studio",
    "borse di studio",
    "candidatura",
    "iscrizione",
    "iscriviti",
    "scadenza",
    "beca",
    "solicitud",
    "inscripción",
    "inscripcion",
    "inscribirse",
    "plazo",
    "convocatoria",
    "stipendium",
    "bewerbung",
    "anmeldung",
    "frist",
    "beurs",
    "aanvraag",
    "inschrijving",
)



def _fold(text: str) -> str:
    text = unicodedata.normalize("NFKC", text or "")
    # Turkish-aware lowering BEFORE casefold: Python's casefold turns 'İ' into 'i' + combining dot (so 'HEKİM' would
    # never match 'hekim'), while the Worker uses toLocaleLowerCase('tr-TR').
    text = text.replace("İ", "i").replace("I", "ı").casefold()
    return (
        text.replace("ı", "i")
        .replace("ş", "s")
        .replace("ğ", "g")
        .replace("ü", "u")
        .replace("ö", "o")
        .replace("ç", "c")
    )


def _keyword_hit(haystack: str, keyword: str) -> bool:
    h = _fold(haystack)
    k = _fold(keyword)
    if not k:
        return False
    # Upper-case acronyms (TUS, YDUS, DUS, IMG...) must match as whole words, never inside e.g. "uydusu".
    if keyword.isupper() and len(k) <= 5:
        return re.search(rf"(?<!\w){re.escape(k)}(?!\w)", h) is not None
    # Prefer word-ish containment; allow multi-word phrases
    if " " in k or len(k) >= 4:
        return k in h
    return re.search(rf"(?<!\w){re.escape(k)}(?!\w)", h) is not None


@dataclass(frozen=True)
class RegistryDecision:
    source_id: str
    decision: str  # ACCEPT | DISCARD | NEEDS_REVIEW
    route: str
    evidence_status: str
    matched_include: list[str]
    matched_exclude: list[str]
    reason: str
    primary_url: str
    source_url: str
    preserve_official_url: bool = True
    virality_must_not_penalize: bool = False


def load_phase1_registry(path: Path | None = None) -> dict[str, Any]:
    p = path or DEFAULT_REGISTRY_PATH
    data = json.loads(p.read_text(encoding="utf-8"))
    if data.get("phase") != 1:
        raise ValueError("expected phase 1 registry")
    if data.get("channelId") != "tip-ogrencileri-platformu":
        raise ValueError("unexpected channelId")
    sources = data.get("sources") or []
    if len(sources) != 6:
        raise ValueError(f"phase 1 expects exactly 6 primary sources, got {len(sources)}")
    for src in sources:
        plan = src.get("fetch_plan")
        if not isinstance(plan, dict):
            raise ValueError(f"{src.get('source_id')}: missing fetch_plan")
        if plan.get("tls_verification_required") is not True:
            raise ValueError(f"{src.get('source_id')}: tls_verification_required must be true")
        if "generic-web-search" in (plan.get("fallback_methods") or []):
            raise ValueError(f"{src.get('source_id')}: generic-web-search forbidden")
    # secondary_sources optional (e.g. Anadolu Ajansı medical radar)
    for sec in data.get("secondary_sources") or []:
        plan = sec.get("fetch_plan") or {}
        if plan.get("tls_verification_required") is not True:
            raise ValueError(f"{sec.get('source_id')}: tls_verification_required must be true")
        if sec.get("source_tier") == "SECONDARY_NEWSWIRE" and sec.get("publication_eligible") is True:
            raise ValueError("secondary newswire cannot be publication_eligible")
    return data


def get_source_profile(registry: dict[str, Any], source_id: str) -> dict[str, Any]:
    for src in registry.get("sources") or []:
        if src["source_id"] == source_id:
            return src
    for src in registry.get("secondary_sources") or []:
        if src["source_id"] == source_id:
            return src
    raise KeyError(source_id)


def load_v11_registry(path: Path | None = None) -> dict[str, Any]:
    """Load approved v1.1 registry. Extra sources are scope-registered; fetch may be manual_review."""
    p = path or V11_REGISTRY_PATH
    data = json.loads(p.read_text(encoding="utf-8"))
    if data.get("channelId") != "tip-ogrencileri-platformu":
        raise ValueError("unexpected channelId")
    approved = list(data.get("approved_source_ids") or [])
    sources = data.get("sources") or []
    ids = [s["source_id"] for s in sources]
    if ids != approved:
        raise ValueError("v1.1 sources must exactly match approved_source_ids order")
    if len(sources) != 23:
        raise ValueError(f"v1.1 expects exactly 23 approved scoped sources, got {len(sources)}")
    # Forbidden IDs must never appear
    banned = {"atuder", "ttb_udek", "congress_calendar", "healthline", "webmd"}
    for sid in ids:
        for b in banned:
            if b in sid.lower():
                raise ValueError(f"forbidden source id in v1.1: {sid}")
    if data.get("global_rules", {}).get("auto_publish") is not False:
        raise ValueError("v1.1 must keep auto_publish false")
    if data.get("global_rules", {}).get("never_disable_tls") is not True:
        raise ValueError("v1.1 must require TLS")
    return data


def host_allowed_for_source(profile: dict[str, Any], url: str) -> bool:
    from urllib.parse import urlparse

    host = (urlparse(url).hostname or "").lower()
    allowed = {h.lower() for h in profile.get("allowed_hostnames") or []}
    return host in allowed


def statement_treatment_for(profile: dict[str, Any], *, is_advocacy: bool = False) -> str:
    """TTB/HASUDER advocacy → organisation_position."""
    sid = profile.get("source_id")
    if sid in ORGANISATION_POSITION_IDS and (
        is_advocacy or profile.get("statement_treatment") == "organisation_position"
    ):
        return "organisation_position"
    return profile.get("statement_treatment") or "official_fact"


def specialty_guideline_eligible(
    profile: dict[str, Any],
    *,
    document_url: str | None,
    document_title: str | None,
    published_at: str | None,
) -> tuple[bool, str]:
    """Clinical updates require a direct society document with title and date."""
    if not profile.get("requires_direct_document_url"):
        return True, "ok"
    if not document_url:
        return False, "specialty guideline requires direct document URL"
    if not document_title:
        return False, "specialty guideline requires document title"
    if not published_at:
        return False, "specialty guideline requires publication/update date"
    if not host_allowed_for_source(profile, document_url):
        # allow PDF on same society host only
        return False, "document URL host not on society allowlist"
    return True, "ok"


def tuik_data_fields_complete(fields: dict[str, Any]) -> tuple[bool, list[str]]:
    required = [
        "numerator",
        "denominator",
        "population",
        "geography",
        "time_period",
        "comparison_period",
        "source_table_or_report_url",
    ]
    missing = [k for k in required if not fields.get(k)]
    return (len(missing) == 0, missing)


def candidate_enters_review_only(
    *,
    provenance: dict[str, Any],
    auto_publish: bool = False,
) -> tuple[bool, str]:
    """All accepted candidates retain provenance and enter review; never auto-publish."""
    if auto_publish:
        return False, "auto_publish forbidden"
    needed = ("source_url", "primary_url", "source_name", "published_at", "fetched_at", "source_tier")
    missing = [k for k in needed if not provenance.get(k)]
    if missing:
        return False, f"missing provenance: {', '.join(missing)}"
    return True, "enters_editorial_review"


def classify_item(
    profile: dict[str, Any],
    *,
    title: str,
    body: str = "",
    medical_impact_clear: bool | None = None,
) -> RegistryDecision:
    """Keyword gate for a single announcement/title against one Phase 1 profile."""
    blob = f"{title}\n{body}"
    exclude_pool = list(profile.get("exclude_keywords") or [])
    if str(profile.get("source_id", "")).startswith("abroad_"):
        exclude_pool += list(ABROAD_LOCAL_NOISE_EXCLUDE_KEYWORDS)
    matched_ex = [k for k in exclude_pool if _keyword_hit(blob, k)]
    matched_in = [k for k in profile.get("include_keywords") or [] if _keyword_hit(blob, k)]

    primary_url = profile.get("primary_url") or profile.get("source_url") or ""
    source_url = profile.get("source_url") or primary_url
    # Global Phase 1 rule: low viral_signal must not penalize primary medical routes.
    viral_safe = True

    if matched_ex:
        return RegistryDecision(
            source_id=profile["source_id"],
            decision="DISCARD",
            route="DISCARD",
            evidence_status="insufficient",
            matched_include=matched_in,
            matched_exclude=matched_ex,
            reason=f"exclude_keyword hit: {matched_ex[0]}",
            primary_url=primary_url,
            source_url=source_url,
            virality_must_not_penalize=viral_safe,
        )

    if not matched_in:
        return RegistryDecision(
            source_id=profile["source_id"],
            decision="DISCARD",
            route="DISCARD",
            evidence_status="insufficient",
            matched_include=[],
            matched_exclude=[],
            reason="no include_keyword hit — not medically scoped for Hekimler Topluluğu",
            primary_url=primary_url,
            source_url=source_url,
            virality_must_not_penalize=viral_safe,
        )

    if str(profile.get("source_id", "")).startswith("abroad_") and not any(
        _keyword_hit(blob, k) for k in ABROAD_OPPORTUNITY_SIGNAL_KEYWORDS
    ):
        return RegistryDecision(
            source_id=profile["source_id"],
            decision="DISCARD",
            route="DISCARD",
            evidence_status="insufficient",
            matched_include=matched_in,
            matched_exclude=[],
            reason="no_concrete_opportunity_signal: regulatory/administrative update about that "
            "country's own system, not something a Turkish applicant can act on",
            primary_url=primary_url,
            source_url=source_url,
            virality_must_not_penalize=viral_safe,
        )

    # Universal audience gate (physicians / dentists / veterinarians / their students & pathways).
    from .hekimler_audience_scope import health_system_layer_hits, in_audience_scope

    in_scope, scope_hits = in_audience_scope(profile["source_id"], title, body)
    if not in_scope:
        hs_hits = health_system_layer_hits(profile["source_id"], title, body)
        if hs_hits:
            hs_route = profile.get("default_route_on_accept") or "PROFESSIONAL_BRIEF"
            if hs_route not in PHASE1_ROUTES:
                hs_route = "PROFESSIONAL_BRIEF"
            return RegistryDecision(
                source_id=profile["source_id"],
                decision="ACCEPT",
                route=hs_route,
                evidence_status="verified",
                matched_include=matched_in,
                matched_exclude=[],
                reason=f"health_system_indirect_impact: {hs_hits[0]}",
                primary_url=primary_url,
                source_url=source_url,
                virality_must_not_penalize=viral_safe,
            )
        return RegistryDecision(
            source_id=profile["source_id"],
            decision="DISCARD",
            route="DISCARD",
            evidence_status="insufficient",
            matched_include=matched_in,
            matched_exclude=[],
            reason="out_of_audience_scope: no physician/dentist/veterinarian/student/pathway term",
            primary_url=primary_url,
            source_url=source_url,
            virality_must_not_penalize=viral_safe,
        )

    # Resmî Gazete: unclear medical impact → NEEDS_REVIEW
    if (
        profile["source_id"] == "resmi_gazete_medical_regulation"
        and medical_impact_clear is False
    ):
        route = profile.get("unclear_impact_route") or "NEEDS_REVIEW"
        return RegistryDecision(
            source_id=profile["source_id"],
            decision="NEEDS_REVIEW",
            route=route,
            evidence_status="needs-check",
            matched_include=matched_in,
            matched_exclude=[],
            reason="medical keywords matched but medical impact unclear",
            primary_url=primary_url,
            source_url=source_url,
            virality_must_not_penalize=viral_safe,
        )

    route = profile.get("default_route_on_accept") or "PROFESSIONAL_BRIEF"
    if route not in PHASE1_ROUTES:
        route = "NEEDS_REVIEW"

    return RegistryDecision(
        source_id=profile["source_id"],
        decision="ACCEPT",
        route=route,
        evidence_status="verified",
        matched_include=matched_in,
        matched_exclude=[],
        reason=f"include_keyword hit: {matched_in[0]}",
        primary_url=primary_url,
        source_url=source_url,
        virality_must_not_penalize=viral_safe,
    )


def classify_for_source(
    registry: dict[str, Any],
    source_id: str,
    *,
    title: str,
    body: str = "",
    medical_impact_clear: bool | None = None,
) -> RegistryDecision:
    profile = get_source_profile(registry, source_id)
    return classify_item(
        profile,
        title=title,
        body=body,
        medical_impact_clear=medical_impact_clear,
    )
