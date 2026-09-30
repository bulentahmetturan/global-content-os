"""Cross-category duplicate listings retire to one Hub heading (Bible §2.1)."""
from __future__ import annotations

import json
import unittest
from pathlib import Path

from radar.tip_toplulugu_activation import ACTIVATION_BLOCKED, compute_activation_state
from radar.tip_toplulugu_continuous_runner import export_automation_ready_profiles
from radar.tip_toplulugu_integrity import resolve_effective_registry
from radar.tip_toplulugu_registry import get_source_profile

ROOT = Path(__file__).resolve().parents[1]
GCOS = ROOT.parents[1]

RETIRED = {
    "ema_news": "haber",
    "fierce_biotech": "haber",
    "medpage_today": "haber",
    "medical_xpress": "research",
    "stat_news": "research",
    "saglik_bakanligi_genel": "haber",
}

KEEP_ACTIVE = (
    "burs_eular",
    "egitim_eular",
    "pubmed_biomedical_evidence",
    "moh_physician_workforce",
    "hsgm_public_health",
    "resmi_gazete_medical_regulation",
    "titck_announcements_general",
    "tuik_medical_public_health",
)

DISABLE_FEEDS = (
    "news-hsgm-news-scoped",
    "news-resmi-gazete-health-scoped",
    "news-titck-general-regulatory",
    "news-tuik-saglik-sosyal-koruma",
    "research-medical-news-today",
)

KEEP_FEEDS = (
    "news-saglik-bakanligi-whole",
    "research-medical-xpress",
)


class CategoryDedupTests(unittest.TestCase):
    def setUp(self):
        self.eff = resolve_effective_registry()

    def test_retired_duplicates_are_blocked_and_off_the_runner(self):
        ready = {p["source_id"] for p in export_automation_ready_profiles(self.eff)}
        for sid, cat in RETIRED.items():
            profile = get_source_profile(self.eff, sid)
            self.assertEqual(profile.get("status"), "retired", sid)
            self.assertEqual(profile.get("canonical_hub_category"), cat, sid)
            self.assertIs(profile.get("fetch_enabled"), False, sid)
            self.assertEqual(compute_activation_state(profile), ACTIVATION_BLOCKED, sid)
            self.assertNotIn(sid, ready)

    def test_same_institution_burs_egitim_and_pubmed_stay(self):
        for sid in KEEP_ACTIVE:
            profile = get_source_profile(self.eff, sid)
            self.assertNotEqual(profile.get("status"), "retired", sid)
            self.assertNotEqual(compute_activation_state(profile), ACTIVATION_BLOCKED, sid)

    def test_kaduse_duplicate_feeds_are_disabled(self):
        feeds = {
            f["id"]: f
            for f in json.loads((GCOS / "config" / "feeds.json").read_text(encoding="utf-8"))["feeds"]
        }
        for fid in DISABLE_FEEDS:
            self.assertFalse(feeds[fid].get("enabled"), fid)
        for fid in KEEP_FEEDS:
            self.assertTrue(feeds[fid].get("enabled"), fid)


if __name__ == "__main__":
    unittest.main()
