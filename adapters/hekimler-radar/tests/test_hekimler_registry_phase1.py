"""Phase 1 Hekimler Source Registry — medical keyword accept/discard fixtures."""
from __future__ import annotations

import unittest
from pathlib import Path

from radar.hekimler_registry import (
    classify_for_source,
    load_phase1_registry,
)

ROOT = Path(__file__).resolve().parents[1]
REGISTRY_PATH = ROOT / "content" / "source-registry-phase1.json"


class Phase1RegistryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.registry = load_phase1_registry(REGISTRY_PATH)

    def test_phase1_has_exactly_six_primary_sources(self):
        sources = self.registry["sources"]
        self.assertEqual(len(sources), 6)
        ids = [s["source_id"] for s in sources]
        self.assertEqual(
            ids,
            [
                "osym_medical_exams",
                "yok_medical_education",
                "yokak_medical_accreditation",
                "tuk_specialty_training",
                "resmi_gazete_medical_regulation",
                "tuik_medical_public_health",
            ],
        )
        live = {
            "osym_medical_exams",
            "yok_medical_education",
            "yokak_medical_accreditation",
            "tuk_specialty_training",
            "resmi_gazete_medical_regulation",
            "tuik_medical_public_health",  # wired via the official home-page bulletin slider (2026-09-20)
        }
        for s in sources:
            self.assertEqual(s["source_tier"], "OFFICIAL_PRIMARY")
            self.assertTrue(s["include_keywords"])
            self.assertTrue(s["exclude_keywords"])
            self.assertTrue(s["allowed_routes"])
            self.assertTrue(s["required_fields"])
            self.assertTrue(s["source_url"])
            self.assertNotIn("generic-web-search", s.get("fetch_mode", ""))
            self.assertIs(s.get("publication_eligible"), False)
            if s["source_id"] in live:
                self.assertIs(s.get("pipeline_wiring_enabled"), True)
                self.assertIs(s.get("candidate_emission_enabled"), True)
                self.assertIs(s.get("fetch_enabled"), True)
                self.assertIs(s.get("scheduled_fetch_enabled"), True)
            else:
                self.assertIs(s.get("pipeline_wiring_enabled"), False)
                self.assertIs(s.get("candidate_emission_enabled"), False)

    def test_no_forbidden_phase1_source_classes(self):
        ids = {s["source_id"] for s in self.registry["sources"]}
        for banned in (
            "moh_public_health",
            "ttb_chambers",
            "congresses",
            "faculty_and_curator",
            "consumer_health_media",
            "trend_radar",
            "ig_",
        ):
            self.assertTrue(
                all(banned not in sid for sid in ids),
                f"forbidden class leaked into phase1 ids via {banned}",
            )
        self.assertEqual(self.registry["phase"], 1)

    def test_osym_tus_accept(self):
        d = classify_for_source(
            self.registry,
            "osym_medical_exams",
            title="2026 TUS 1. Dönem Başvuru Tarihleri Açıklandı",
        )
        self.assertEqual(d.decision, "ACCEPT")
        self.assertEqual(d.route, "OPPORTUNITY")
        self.assertTrue(d.virality_must_not_penalize)

    def test_osym_kpss_discard(self):
        d = classify_for_source(
            self.registry,
            "osym_medical_exams",
            title="2026 KPSS Lisans Başvuru Duyurusu",
        )
        self.assertEqual(d.decision, "DISCARD")
        self.assertEqual(d.route, "DISCARD")

    def test_yok_medical_faculty_accept(self):
        d = classify_for_source(
            self.registry,
            "yok_medical_education",
            title="Yeni Tıp Fakültesi Kontenjanları Güncellendi",
        )
        self.assertEqual(d.decision, "ACCEPT")
        self.assertIn(d.route, {"PROFESSIONAL_BRIEF", "CAREER", "OPPORTUNITY"})

    def test_yok_unrelated_faculty_discard(self):
        d = classify_for_source(
            self.registry,
            "yok_medical_education",
            title="Hukuk Fakültesi Kontenjanları Artırıldı",
        )
        self.assertEqual(d.decision, "DISCARD")

    def test_yokak_medical_accreditation_accept(self):
        d = classify_for_source(
            self.registry,
            "yokak_medical_accreditation",
            title="Tıp Programı Akreditasyon Standartları Güncellendi",
        )
        self.assertEqual(d.decision, "ACCEPT")
        self.assertIn(d.route, {"PROFESSIONAL_BRIEF", "EDUCATION"})

    def test_tuk_rotation_curriculum_accept(self):
        d = classify_for_source(
            self.registry,
            "tuk_specialty_training",
            title="TUK Kararı: Uzmanlık Eğitimi Rotasyonları Güncellendi",
        )
        self.assertEqual(d.decision, "ACCEPT")
        self.assertEqual(d.route, "PROFESSIONAL_BRIEF")

    def test_resmi_gazete_unrelated_discard(self):
        d = classify_for_source(
            self.registry,
            "resmi_gazete_medical_regulation",
            title="Karayolu Taşıma Yönetmeliğinde Değişiklik Yapılmasına Dair Yönetmelik",
        )
        self.assertEqual(d.decision, "DISCARD")

    def test_resmi_gazete_physician_regulation_accept(self):
        d = classify_for_source(
            self.registry,
            "resmi_gazete_medical_regulation",
            title="Tıpta ve Diş Hekimliğinde Uzmanlık Eğitimi Yönetmeliğinde Değişiklik",
            medical_impact_clear=True,
        )
        self.assertEqual(d.decision, "ACCEPT")
        self.assertIn(d.route, {"PROFESSIONAL_BRIEF", "PUBLIC_HEALTH", "CAREER"})

    def test_resmi_gazete_unclear_impact_needs_review(self):
        d = classify_for_source(
            self.registry,
            "resmi_gazete_medical_regulation",
            title="Hekimlerin Çalışma Usulleri ile İlgili Düzenleme",
            medical_impact_clear=False,
        )
        self.assertEqual(d.decision, "NEEDS_REVIEW")
        self.assertEqual(d.route, "NEEDS_REVIEW")

    def test_tuik_cause_of_death_accept(self):
        d = classify_for_source(
            self.registry,
            "tuik_medical_public_health",
            title="Ölüm ve Ölüm Nedeni İstatistikleri, 2024",
        )
        self.assertEqual(d.decision, "ACCEPT")
        self.assertIn(d.route, {"PUBLIC_HEALTH", "DATA_INSIGHT", "PROFESSIONAL_BRIEF"})

    def test_tuik_health_expenditure_accept(self):
        d = classify_for_source(
            self.registry,
            "tuik_medical_public_health",
            title="Sağlık Harcamaları İstatistikleri, 2023",
        )
        self.assertEqual(d.decision, "ACCEPT")

    def test_kpss_style_generic_item_discarded_for_broad_source(self):
        for sid in ("osym_medical_exams", "yok_medical_education"):
            d = classify_for_source(
                self.registry,
                sid,
                title="KPSS Lisans Sınavı Başvuru Kılavuzu",
            )
            self.assertEqual(d.decision, "DISCARD", sid)

    def test_tuik_inflation_discard(self):
        d = classify_for_source(
            self.registry,
            "tuik_medical_public_health",
            title="Tüketici Fiyat Endeksi (TÜFE) / Enflasyon, Ağustos 2026",
        )
        self.assertEqual(d.decision, "DISCARD")

    def test_tuik_tourism_discard(self):
        d = classify_for_source(
            self.registry,
            "tuik_medical_public_health",
            title="Turizm İstatistikleri, 2026",
        )
        self.assertEqual(d.decision, "DISCARD")

    def test_global_routes_do_not_include_feed_or_trend(self):
        routes = set(self.registry["global_rules"]["candidate_routes"])
        self.assertNotIn("FEED", routes)
        self.assertNotIn("TREND_INBOX", routes)
        self.assertIn("DISCARD", routes)
        self.assertIn("NEEDS_REVIEW", routes)


if __name__ == "__main__":
    unittest.main()
