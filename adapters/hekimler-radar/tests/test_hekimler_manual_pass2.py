"""Manual pass 2 — HASUDER / Pediatri / USMLE / NRMP / CaRMS / MCC news lists."""
from __future__ import annotations

import unittest

from radar.hekimler_activation import ACTIVATION_AUTOMATION_READY, compute_activation_state
from radar.hekimler_continuous_runner import export_automation_ready_profiles
from radar.hekimler_integrity import resolve_effective_registry
from radar.hekimler_registry import get_source_profile


class ManualPass2ActivationTests(unittest.TestCase):
    def setUp(self):
        self.eff = resolve_effective_registry()

    def test_six_new_sources_ready(self):
        # abroad_us_usmle / abroad_us_nrmp disabled 2026-09-24 (S51): regularly produced content
        # but none of it was ever scholarship/education, only exam-administration logistics.
        for sid, sample in (
            ("hasuder_public_health", "https://www.hasuder.org.tr/listele/duyurular-hasuder-cat"),
            ("turk_pediatri_kurumu", "https://turkpediatri.org.tr/haberler"),
            ("abroad_ca_mcc_img_pathways", "https://mcc.ca/news/"),
        ):
            profile = get_source_profile(self.eff, sid)
            self.assertEqual(compute_activation_state(profile), ACTIVATION_AUTOMATION_READY, sid)
            self.assertEqual(profile.get("source_url"), sample)
            self.assertIs(profile.get("publication_eligible"), False)

    def test_export_includes_pass2(self):
        ready = {p["source_id"] for p in export_automation_ready_profiles(self.eff)}
        for sid in (
            "hasuder_public_health",
            "turk_pediatri_kurumu",
            "abroad_ca_mcc_img_pathways",
        ):
            self.assertIn(sid, ready)
        import json
        from pathlib import Path

        canon = json.loads((Path(__file__).parent / "fixtures" / "hekimler_ready_sources.json").read_text(encoding="utf-8"))
        self.assertEqual(ready, set(canon["automation_ready"]))


if __name__ == "__main__":
    unittest.main()
