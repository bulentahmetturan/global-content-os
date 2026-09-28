"""Hekimler registry integrity — load/merge precedence and boundary checks.

Registry-only. No queue writes, no live fetch, no publishing.
"""
from __future__ import annotations

import ast
from pathlib import Path
from typing import Any

from .hekimler_abroad_career import load_abroad_career_registry
from .hekimler_burs import load_burs_registry
from .hekimler_egitim import load_egitim_registry
from .hekimler_registry import (
    get_source_profile,
    load_phase1_registry,
    load_v11_registry,
)

ROOT = Path(__file__).resolve().parents[1]
RADAR = ROOT / "radar"
BATCH2_PATH = ROOT / "content" / "source-registry-batch2.json"
BATCH3_PATH = ROOT / "content" / "source-registry-batch3.json"

# Domestic v1.1 OFFICIAL_PRIMARY set (unchanged by Abroad Career additive layer)
DOMESTIC_OFFICIAL_PRIMARY_IDS = frozenset(
    {
        "osym_medical_exams",
        "yok_medical_education",
        "yokak_medical_accreditation",
        "tuk_specialty_training",
        "resmi_gazete_medical_regulation",
        "tuik_medical_public_health",
        "moh_physician_workforce",
        "hsgm_public_health",
        "osym_dus_dental_exams",
        "osym_ydus_subspecialty_exams",
        "titck_announcements_general",
        "saglik_bakanligi_genel",
    }
)
# Back-compat alias for existing imports
OFFICIAL_PRIMARY_IDS = DOMESTIC_OFFICIAL_PRIMARY_IDS

PROFESSIONAL_BODY_IDS = frozenset(
    {"ttb_national", "turkmsic_medical_students", "hasuder_public_health", "tvhb_veterinary", "tdb_dental"}
)
PROFESSIONAL_GUIDANCE_IDS = frozenset(
    {
        "tepdad_medical_accreditation",
        "teged_medical_education",
        "halk_sagligi_yeterlik",
        "tkd_cardiology",
        "ttd_thoracic",
        "klimık_infectious_diseases",
        "tpd_psychiatry",
        "trd_radiology",
        "tahud_family_medicine",
        "tihud_internal_medicine",
        "turk_pediatri_kurumu",
        "tatd_emergency_medicine",
    }
)


LOAD_MERGE_ORDER = (
    "1. Load source-registry-phase1.json as base (6 hardened profiles + AA secondary).",
    "2. Load source-registry-v1.1.json as overlay (additive MoH/professional/specialty scope).",
    "3. For shared phase1/v1.1 source_ids: phase1 fetch_plan/observability/activation win; v1.1 source_tier/statement_treatment/routes win.",
    "4. Load source-registry-abroad-career-v1.json as additive Abroad Career layer (abroad_* IDs only; never overrides phase1/v1.1).",
    "5. Load source-registry-batch2.json as additive Batch 2 layer (new IDs only; PubMed approved-query pack).",
    "6. Load source-registry-batch3.json as additive Batch 3 layer (new IDs only; international English health/medical discovery pool).",
    "7. Load source-registry-burs-v1.json as additive Burs lane (burs_* IDs only; never overrides prior layers).",
    "8. Load source-registry-egitim-v1.json as additive Eğitim lane (egitim_* IDs only; never overrides prior layers).",
    "9. Resolve to exactly one effective profile per source_id.",
)


def load_batch2_registry() -> dict[str, Any]:
    if not BATCH2_PATH.exists():
        return {"sources": []}
    import json

    return json.loads(BATCH2_PATH.read_text(encoding="utf-8"))


def load_batch3_registry() -> dict[str, Any]:
    if not BATCH3_PATH.exists():
        return {"sources": []}
    import json

    return json.loads(BATCH3_PATH.read_text(encoding="utf-8"))


def resolve_effective_registry(
    phase1: dict[str, Any] | None = None,
    v11: dict[str, Any] | None = None,
    abroad: dict[str, Any] | None = None,
    batch2: dict[str, Any] | None = None,
    batch3: dict[str, Any] | None = None,
    burs: dict[str, Any] | None = None,
    egitim: dict[str, Any] | None = None,
) -> dict[str, Any]:
    p1 = phase1 or load_phase1_registry()
    v = v11 or load_v11_registry()
    ab = abroad if abroad is not None else load_abroad_career_registry()
    b2 = batch2 if batch2 is not None else load_batch2_registry()
    b3 = batch3 if batch3 is not None else load_batch3_registry()
    bu = burs if burs is not None else load_burs_registry()
    eg = egitim if egitim is not None else load_egitim_registry()
    p1_by_id = {s["source_id"]: s for s in p1["sources"]}
    effective: list[dict[str, Any]] = []
    seen: set[str] = set()
    for src in v["sources"]:
        sid = src["source_id"]
        seen.add(sid)
        if sid in p1_by_id:
            merged = dict(src)
            base = p1_by_id[sid]
            if base.get("fetch_plan"):
                merged["fetch_plan"] = base["fetch_plan"]
            for k in (
                "fetch_enabled",
                "scheduled_fetch_enabled",
                "candidate_emission_enabled",
                "publication_eligible",
                "pipeline_wiring_enabled",
                "runtime_activation",
                "include_keywords",
                "exclude_keywords",
                "audience_segments",
                "default_route_on_accept",
                "source_url",
                "primary_url",
                "scope_url_in_gate",
                "scope_url_keywords",
                "parser_profile",
            ):
                if k in base:
                    merged[k] = base[k]
            effective.append(merged)
        else:
            effective.append(dict(src))
    for sid, src in p1_by_id.items():
        if sid not in seen:
            effective.append(dict(src))
            seen.add(sid)

    for src in ab.get("sources") or []:
        sid = src["source_id"]
        if sid in seen:
            raise ValueError(f"abroad source_id collides with existing profile: {sid}")
        effective.append(dict(src))
        seen.add(sid)

    for src in b2.get("sources") or []:
        sid = src["source_id"]
        if sid in seen:
            raise ValueError(f"batch2 source_id collides with existing profile: {sid}")
        effective.append(dict(src))
        seen.add(sid)

    for src in b3.get("sources") or []:
        sid = src["source_id"]
        if sid in seen:
            raise ValueError(f"batch3 source_id collides with existing profile: {sid}")
        effective.append(dict(src))
        seen.add(sid)

    for src in bu.get("sources") or []:
        sid = src["source_id"]
        if not str(sid).startswith("burs_"):
            raise ValueError(f"burs layer source_id must start with burs_: {sid}")
        if sid in seen:
            raise ValueError(f"burs source_id collides with existing profile: {sid}")
        effective.append(dict(src))
        seen.add(sid)

    for src in eg.get("sources") or []:
        sid = src["source_id"]
        if not str(sid).startswith("egitim_"):
            raise ValueError(f"egitim layer source_id must start with egitim_: {sid}")
        if sid in seen:
            raise ValueError(f"egitim source_id collides with existing profile: {sid}")
        effective.append(dict(src))
        seen.add(sid)

    secondaries = list(p1.get("secondary_sources") or [])
    v_sec = {s["source_id"]: s for s in v.get("secondary_sources") or []}
    merged_sec = []
    for s in secondaries:
        if s["source_id"] in v_sec:
            m = dict(s)
            m.update({k: v_sec[s["source_id"]][k] for k in v_sec[s["source_id"]] if k != "fetch_plan"})
            if s.get("fetch_plan"):
                m["fetch_plan"] = s["fetch_plan"]
            merged_sec.append(m)
        else:
            merged_sec.append(s)
    return {
        "registryId": "hekimler-effective-registry",
        "loadMergeOrder": list(LOAD_MERGE_ORDER),
        "baseRegistry": "source-registry-phase1.json",
        "overlayRegistry": "source-registry-v1.1.json",
        "abroadCareerRegistry": "source-registry-abroad-career-v1.json",
        "batch2Registry": "source-registry-batch2.json",
        "batch3Registry": "source-registry-batch3.json",
        "bursRegistry": "source-registry-burs-v1.json",
        "egitimRegistry": "source-registry-egitim-v1.json",
        "sources": effective,
        "secondary_sources": merged_sec,
        "pipeline_wiring_enabled": bool((p1.get("global_rules") or {}).get("pipeline_wiring_enabled")),
        "congress_features_active": False,
        "publication_eligible": False,
    }


def assert_unique_source_ids(reg: dict[str, Any]) -> None:
    ids = [s["source_id"] for s in reg["sources"]]
    ids += [s["source_id"] for s in reg.get("secondary_sources") or []]
    if len(ids) != len(set(ids)):
        raise ValueError("duplicate source_id across registry layers")


def tier_counts(reg: dict[str, Any]) -> dict[str, int]:
    from collections import Counter

    c = Counter(s["source_tier"] for s in reg["sources"])
    for s in reg.get("secondary_sources") or []:
        c[s["source_tier"]] += 1
    return dict(c)


def manual_review_sources_disabled(reg: dict[str, Any]) -> list[str]:
    bad = []
    for s in list(reg["sources"]) + list(reg.get("secondary_sources") or []):
        health = s.get("source_health") or (s.get("fetch_plan") or {}).get("source_health")
        if health == "MANUAL_REVIEW_REQUIRED" or s.get("status") == "manual_review":
            for flag in (
                "fetch_enabled",
                "scheduled_fetch_enabled",
                "candidate_emission_enabled",
                "publication_eligible",
                "pipeline_wiring_enabled",
            ):
                if s.get(flag) is not False:
                    bad.append(f"{s['source_id']}.{flag}={s.get(flag)}")
    return bad


def can_emit_candidate(profile: dict[str, Any]) -> bool:
    if profile.get("candidate_emission_enabled") is True:
        return True
    if profile.get("pipeline_wiring_enabled") is True:
        return True
    return False


def congress_features_active() -> bool:
    """Congress helpers in hekimler_fetch are discard gates only — not an active congress system."""
    return False


def hekimler_modules_queue_boundary_ok() -> tuple[bool, str]:
    """Static check: policy/registry hekimler_* modules must not import queue writers.

    Explicit wiring modules (continuous runner / hub bridge) may touch Database /
    Hub delivery — they still must not publish or auto-approve.
    """
    wiring_modules = {
        "hekimler_continuous_runner.py",
        "hekimler_hub_bridge.py",
    }
    forbidden_imports = {
        "pipeline",
        "database",
        "schedule",
        "apscheduler",
        "celery",
    }
    for path in RADAR.glob("hekimler_*.py"):
        if path.name in wiring_modules:
            # Wiring modules: still ban schedulers / celery / pipeline publish path
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
            for node in ast.walk(tree):
                if isinstance(node, (ast.Import, ast.ImportFrom)):
                    names = []
                    if isinstance(node, ast.Import):
                        names = [a.name for a in node.names]
                    else:
                        names = [node.module or ""]
                    for name in names:
                        root = (name or "").split(".")[0]
                        if root in {"schedule", "apscheduler", "celery", "pipeline"}:
                            return False, f"{path.name} imports {name}"
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    root = alias.name.split(".")[0]
                    if root in forbidden_imports:
                        return False, f"{path.name} imports {alias.name}"
            if isinstance(node, ast.ImportFrom):
                mod = (node.module or "").split(".")[0]
                if mod in forbidden_imports:
                    return False, f"{path.name} imports from {node.module}"
                if node.level and node.module in forbidden_imports:
                    return False, f"{path.name} relative-imports {node.module}"
    return True, "ok"


def resolve_profile(source_id: str, effective: dict[str, Any] | None = None) -> dict[str, Any]:
    reg = effective or resolve_effective_registry()
    return get_source_profile(reg, source_id)
