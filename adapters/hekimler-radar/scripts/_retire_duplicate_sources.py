"""Retire true cross-category duplicate listings. Keep burs/egitim pairs and PubMed evidence."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GCOS = ROOT.parents[1]

# Duyuru copies that already exist under Haber or Research.
RETIRE_REGISTRY = {
    "ema_news": {
        "canonical_hub_category": "haber",
        "retired_reason": "Bible §2.1 one primary category per content stream. EMA news already lives on Haber; retire the Duyuru listing.",
    },
    "fierce_biotech": {
        "canonical_hub_category": "haber",
        "retired_reason": "Fierce Biotech already lives on Haber; retire the Duyuru listing.",
    },
    "medpage_today": {
        "canonical_hub_category": "haber",
        "retired_reason": "MedPage Today already lives on Haber; retire the Duyuru listing.",
    },
    "medical_xpress": {
        "canonical_hub_category": "research",
        "retired_reason": "Medical Xpress already lives on Research; retire the Duyuru listing.",
    },
    "stat_news": {
        "canonical_hub_category": "research",
        "retired_reason": "STAT News already lives on Research; retire the Duyuru listing.",
    },
    "saglik_bakanligi_genel": {
        "canonical_hub_category": "haber",
        "retired_reason": "Sağlık Bakanlığı genel haber already lives on Haber (news-saglik-bakanligi-whole). Keep moh_physician_workforce (YHGM atama) on Duyuru.",
    },
}

# Haber/Research feeds that duplicate a Hekimler Duyuru source.
DISABLE_FEEDS = {
    "news-hsgm-news-scoped": "HSGM stays on Duyuru (hsgm_public_health).",
    "news-resmi-gazete-health-scoped": "Resmî Gazete stays on Duyuru (resmi_gazete_medical_regulation).",
    "news-titck-general-regulatory": "TİTCK stays on Duyuru (titck_announcements_general).",
    "news-tuik-saglik-sosyal-koruma": "TÜİK stays on Duyuru (tuik_medical_public_health).",
    "research-medical-news-today": "Medical News Today stays on Haber (sitemap feed).",
}


def _load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _dump(path: Path, data) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _retire_source(src: dict, meta: dict) -> bool:
    if src.get("source_id") not in RETIRE_REGISTRY:
        return False
    src["status"] = "retired"
    src["runtime_activation"] = "BLOCKED"
    src["fetch_enabled"] = False
    src["scheduled_fetch_enabled"] = False
    src["candidate_emission_enabled"] = False
    src["pipeline_wiring_enabled"] = False
    src["canonical_hub_category"] = meta["canonical_hub_category"]
    src["retired_reason"] = meta["retired_reason"]
    plan = src.get("fetch_plan")
    if isinstance(plan, dict):
        plan["fetch_enabled"] = False
        plan["scheduled_fetch_enabled"] = False
        plan["candidate_emission_enabled"] = False
    return True


def patch_registry(path: Path) -> list[str]:
    data = _load(path)
    hit: list[str] = []
    for src in data.get("sources") or []:
        sid = src.get("source_id")
        meta = RETIRE_REGISTRY.get(sid)
        if meta and _retire_source(src, meta):
            hit.append(sid)
    review = data.get("batch3_review")
    if isinstance(review, dict):
        for sid, meta in RETIRE_REGISTRY.items():
            if sid in review:
                review[sid] = {
                    "decision": "RETIRED_DUPLICATE",
                    "reason": meta["retired_reason"],
                    "canonical_hub_category": meta["canonical_hub_category"],
                }
    _dump(path, data)
    return hit


def patch_feeds(path: Path) -> list[str]:
    data = _load(path)
    hit: list[str] = []
    for feed in data.get("feeds") or []:
        fid = feed.get("id")
        if fid in DISABLE_FEEDS:
            feed["enabled"] = False
            hit.append(fid)
    _dump(path, data)
    return hit


def patch_ready_fixture(path: Path) -> list[str]:
    data = _load(path)
    before = list(data["automation_ready"])
    data["automation_ready"] = [sid for sid in before if sid not in RETIRE_REGISTRY]
    _dump(path, data)
    return [sid for sid in before if sid in RETIRE_REGISTRY]


def main() -> None:
    b2 = patch_registry(ROOT / "content" / "source-registry-batch2.json")
    b3 = patch_registry(ROOT / "content" / "source-registry-batch3.json")
    feeds = patch_feeds(GCOS / "config" / "feeds.json")
    ready = patch_ready_fixture(ROOT / "tests" / "fixtures" / "hekimler_ready_sources.json")
    print("batch2", b2)
    print("batch3", b3)
    print("feeds", feeds)
    print("ready_removed", ready)


if __name__ == "__main__":
    main()
