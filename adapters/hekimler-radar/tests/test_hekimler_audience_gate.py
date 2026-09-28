"""Audience-only gate: menu/nav links and non-post URLs must never become candidates."""
import json
import re
import unittest
from pathlib import Path

from radar.hekimler_activation import compute_activation_state
from radar.hekimler_integrity import resolve_effective_registry

CONTENT = Path(__file__).resolve().parents[1] / "content"


class AudienceGateTests(unittest.TestCase):
    def test_policy_map_states_audience_only_gate(self):
        pm = json.loads((CONTENT / "policies" / "hekimler-source-policy-map.json").read_text(encoding="utf-8"))
        self.assertIn("audienceOnlyGate", pm["globalRules"])
        self.assertIn("DISCARD", pm["globalRules"]["audienceOnlyGate"])

    def test_society_sources_pin_post_url_shape(self):
        eff = {s["source_id"]: s for s in resolve_effective_registry()["sources"]}
        for sid, nav, post in (
            ("tkd_cardiology", "https://www.tkd.org.tr/kilavuzlar", "https://www.tkd.org.tr/duyuru/5445/tkd-asistan-okulu-2026"),
            ("tahud_family_medicine", "https://tahud.org.tr/kurul/merkez-yonetim-kurulu", "https://tahud.org.tr/haber/turk-hipertansiyon-uzlasi-raporu-2025"),
        ):
            pats = [re.compile(p) for p in eff[sid]["item_url_patterns"]]
            self.assertEqual(compute_activation_state(eff[sid]), "AUTOMATION_READY")
            self.assertFalse(any(p.search(nav) for p in pats))
            self.assertTrue(any(p.search(post) for p in pats))

    def test_health_system_layer_admits_indirect_items_from_official_sources_only(self):
        from radar.hekimler_registry import classify_item

        eff = {s["source_id"]: s for s in resolve_effective_registry()["sources"]}
        rg = eff["resmi_gazete_medical_regulation"]
        d = classify_item(rg, title="Sağlık Hizmetleri ile İlgili Düzenleme", body="")
        self.assertEqual(d.decision, "ACCEPT")
        self.assertIn("health_system_indirect_impact", d.reason)
        kpss = classify_item(eff["osym_medical_exams"], title="KPSS Lisans Sınavı Başvuru Kılavuzu")
        self.assertEqual(kpss.decision, "DISCARD")
        # Non-official / audience-external source: layer must not apply.
        ttb_like = dict(eff["turkmsic_medical_students"], source_id="unlisted_source")
        d2 = classify_item(ttb_like, title="Hastane açılışı hakkında genel haber", body="")
        self.assertEqual(d2.decision, "DISCARD")


if __name__ == "__main__":
    unittest.main()
