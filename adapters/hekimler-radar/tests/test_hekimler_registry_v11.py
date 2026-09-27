"""Hekimler Source Registry v1.1 — approved IDs, gates, provenance, no auto-publish."""
from __future__ import annotations

import unittest
from pathlib import Path

from radar.hekimler_fetch import classify_with_congress_gate, viral_signal_must_not_downgrade
from radar.hekimler_registry import (
    candidate_enters_review_only,
    classify_for_source,
    get_source_profile,
    host_allowed_for_source,
    load_phase1_registry,
    load_v11_registry,
    specialty_guideline_eligible,
    statement_treatment_for,
    tuik_data_fields_complete,
)

ROOT = Path(__file__).resolve().parents[1]
V11_PATH = ROOT / "content" / "source-registry-v1.1.json"
PHASE1_PATH = ROOT / "content" / "source-registry-phase1.json"


class V11RegistryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.v11 = load_v11_registry(V11_PATH)
        cls.phase1 = load_phase1_registry(PHASE1_PATH)

    def test_only_approved_source_ids(self):
        ids = [s["source_id"] for s in self.v11["sources"]]
        self.assertEqual(ids, self.v11["approved_source_ids"])
        self.assertEqual(len(ids), 23)
        self.assertNotIn("atuder", "".join(ids).lower())
        self.assertNotIn("congress", "".join(ids).lower())

    def test_non_approved_hosts_rejected(self):
        osym = get_source_profile(self.v11, "osym_medical_exams")
        self.assertFalse(host_allowed_for_source(osym, "https://evil.example/SinavGrubu/Index/6"))
        self.assertTrue(host_allowed_for_source(osym, "https://www.osym.gov.tr/SinavGrubu/Index/6"))

    def test_osym_accept_reject_via_phase1_gate(self):
        ok = classify_for_source(self.phase1, "osym_medical_exams", title="2026 TUS Başvuru")
        bad = classify_for_source(self.phase1, "osym_medical_exams", title="2026 KPSS Lisans")
        self.assertEqual(ok.decision, "ACCEPT")
        self.assertEqual(bad.decision, "DISCARD")

    def test_yok_rejects_non_medical(self):
        d = classify_for_source(
            self.phase1,
            "yok_medical_education",
            title="Hukuk Fakültesi Kontenjanları Artırıldı",
        )
        self.assertEqual(d.decision, "DISCARD")

    def test_tuk_and_rg_require_impact_explanation(self):
        tuk = get_source_profile(self.v11, "tuk_specialty_training")
        rg = get_source_profile(self.v11, "resmi_gazete_medical_regulation")
        self.assertTrue(tuk.get("requires_impact_explanation"))
        self.assertTrue(rg.get("requires_impact_explanation"))
        unclear = classify_for_source(
            self.phase1,
            "resmi_gazete_medical_regulation",
            title="Hekimlerin Çalışma Usulleri ile İlgili Düzenleme",
            medical_impact_clear=False,
        )
        self.assertEqual(unclear.route, "NEEDS_REVIEW")

    def test_tuik_retains_denominator_and_time_period(self):
        tuik = get_source_profile(self.v11, "tuik_medical_public_health")
        self.assertIn("denominator", tuik["required_data_fields"])
        self.assertIn("time_period", tuik["required_data_fields"])
        ok, missing = tuik_data_fields_complete(
            {
                "numerator": "12000",
                "denominator": "100000",
                "population": "TR",
                "geography": "Türkiye",
                "time_period": "2024",
                "comparison_period": "2023",
                "source_table_or_report_url": "https://data.tuik.gov.tr/example",
            }
        )
        self.assertTrue(ok)
        self.assertEqual(missing, [])
        incomplete, miss = tuik_data_fields_complete({"numerator": "1"})
        self.assertFalse(incomplete)
        self.assertIn("denominator", miss)
        self.assertIn("time_period", miss)

    def test_ttb_hasuder_organisation_position(self):
        ttb = get_source_profile(self.v11, "ttb_national")
        hasuder = get_source_profile(self.v11, "hasuder_public_health")
        self.assertEqual(statement_treatment_for(ttb, is_advocacy=True), "organisation_position")
        self.assertEqual(statement_treatment_for(hasuder, is_advocacy=True), "organisation_position")
        self.assertEqual(ttb["statement_treatment"], "organisation_position")
        self.assertEqual(hasuder["statement_treatment"], "organisation_position")
        turkmsic = get_source_profile(self.v11, "turkmsic_medical_students")
        self.assertEqual(turkmsic["statement_treatment"], "organisation_statement")

    def test_specialty_guideline_requires_direct_document(self):
        tkd = get_source_profile(self.v11, "tkd_cardiology")
        ok, _ = specialty_guideline_eligible(
            tkd,
            document_url="https://www.tkd.org.tr/kilavuzlar/hipertansiyon-2024.pdf",
            document_title="Hipertansiyon Kılavuzu 2024",
            published_at="2024-06-01",
        )
        self.assertTrue(ok)
        bad, reason = specialty_guideline_eligible(
            tkd,
            document_url=None,
            document_title="Hipertansiyon Kılavuzu 2024",
            published_at="2024-06-01",
        )
        self.assertFalse(bad)
        self.assertIn("document URL", reason)

    def test_congress_discard(self):
        profile = get_source_profile(self.phase1, "tuk_specialty_training")
        d = classify_with_congress_gate(
            profile,
            title="Ulusal Kardiyoloji Kongresi Abstract ve Erken Kayıt",
        )
        self.assertEqual(d.decision, "DISCARD")

    def test_low_viral_does_not_downgrade(self):
        for route in (
            "OPPORTUNITY",
            "CAREER",
            "EDUCATION",
            "PROFESSIONAL_BRIEF",
            "PUBLIC_HEALTH",
            "DATA_INSIGHT",
        ):
            self.assertTrue(viral_signal_must_not_downgrade(route, viral_signal=0))

    def test_provenance_and_no_auto_publish(self):
        self.assertFalse(self.v11["global_rules"]["auto_publish"])
        self.assertTrue(self.v11["global_rules"]["editorial_review_mandatory"])
        ok, reason = candidate_enters_review_only(
            provenance={
                "source_url": "https://www.osym.gov.tr/x",
                "primary_url": "https://www.osym.gov.tr/x",
                "source_name": "ÖSYM",
                "published_at": "2026-09-01",
                "fetched_at": "2026-09-19T00:00:00Z",
                "source_tier": "OFFICIAL_PRIMARY",
            },
            auto_publish=False,
        )
        self.assertTrue(ok)
        self.assertEqual(reason, "enters_editorial_review")
        blocked, _ = candidate_enters_review_only(
            provenance={
                "source_url": "https://www.osym.gov.tr/x",
                "primary_url": "https://www.osym.gov.tr/x",
                "source_name": "ÖSYM",
                "published_at": "2026-09-01",
                "fetched_at": "2026-09-19T00:00:00Z",
                "source_tier": "OFFICIAL_PRIMARY",
            },
            auto_publish=True,
        )
        self.assertFalse(blocked)

    def test_no_atuder_or_congress_calendar_route(self):
        routes = set(self.v11["global_rules"]["allowed_routes"])
        self.assertNotIn("CONGRESS_CALENDAR", routes)
        excluded = " ".join(self.v11["global_rules"]["explicitly_excluded"]).lower()
        self.assertIn("atuder", excluded)
        self.assertIn("congress", excluded)


if __name__ == "__main__":
    unittest.main()
