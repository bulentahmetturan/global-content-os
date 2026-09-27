"""Hardened fetch plans + Anadolu Ajansı secondary radar fixtures (no live network)."""
from __future__ import annotations

import unittest
from pathlib import Path

from radar.hekimler_fetch import (
    aa_path_allowed,
    classify_anadolu_ajansi,
    classify_with_congress_gate,
    evaluate_fetch_result,
    evaluate_tls_failure,
    url_allowed_by_plan,
    viral_signal_must_not_downgrade,
)
from radar.hekimler_registry import get_source_profile, load_phase1_registry

ROOT = Path(__file__).resolve().parents[1]
REGISTRY_PATH = ROOT / "content" / "source-registry-phase1.json"


class FetchHardenTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.registry = load_phase1_registry(REGISTRY_PATH)

    def test_every_primary_has_fetch_plan_and_tls_required(self):
        for src in self.registry["sources"]:
            plan = src["fetch_plan"]
            self.assertIs(plan["tls_verification_required"], True)
            self.assertIn(plan["source_health"], {
                "HEALTHY", "NO_CHANGE", "DEGRADED", "MANUAL_REVIEW_REQUIRED", "DISABLED"
            })
            self.assertTrue(plan["allowed_hostnames"])
            self.assertNotIn("generic-web-search", plan.get("fallback_methods") or [])

    def test_tls_failure_fail_closed_degraded(self):
        out = evaluate_tls_failure("resmi_gazete_medical_regulation", "https://www.resmigazete.gov.tr/fihrist")
        self.assertEqual(out.source_health, "DEGRADED")
        self.assertEqual(out.log.tls_verification_result, "FAILED")
        self.assertFalse(out.allow_queue)
        self.assertIn("fail closed", out.reason.lower())
        self.assertIn("insecure transport forbidden", out.reason.lower())
        self.assertNotIn("verify=False", out.reason)
        self.assertNotIn("CERT_NONE", out.reason)

    def test_zero_result_healthy_no_change(self):
        out = evaluate_fetch_result(
            source_id="osym_medical_exams",
            surface="tus_group",
            requested_url="https://www.osym.gov.tr/SinavGrubu/Index/6",
            http_status=200,
            tls_ok=True,
            parsed_item_count=0,
            accepted_candidate_count=0,
            discarded_candidate_count=0,
            content_hash="abc",
            previous_content_hash="abc",
            parser_failed=False,
        )
        self.assertEqual(out.source_health, "NO_CHANGE")
        self.assertFalse(out.allow_queue)

    def test_zero_result_parser_failure_degraded(self):
        out = evaluate_fetch_result(
            source_id="yok_medical_education",
            surface="announcements",
            requested_url="https://www.yok.gov.tr/tr/announcements",
            http_status=200,
            tls_ok=True,
            parsed_item_count=0,
            accepted_candidate_count=0,
            discarded_candidate_count=0,
            content_hash=None,
            previous_content_hash=None,
            parser_failed=True,
        )
        self.assertEqual(out.source_health, "DEGRADED")
        self.assertEqual(out.log.alert, "PARSER_FAILURE")

    def test_successful_primary_fetch_fixture(self):
        out = evaluate_fetch_result(
            source_id="tuk_specialty_training",
            surface="duyurular",
            requested_url="https://tuk.saglik.gov.tr/TR-30142/duyurular.html",
            http_status=200,
            tls_ok=True,
            parsed_item_count=3,
            accepted_candidate_count=1,
            discarded_candidate_count=2,
            content_hash="hash1",
            previous_content_hash="hash0",
            parser_failed=False,
        )
        self.assertEqual(out.source_health, "HEALTHY")
        self.assertTrue(out.allow_queue)

    def test_osym_host_gate_rejects_foreign_host(self):
        plan = get_source_profile(self.registry, "osym_medical_exams")["fetch_plan"]
        ok, reason = url_allowed_by_plan("https://evil.example/SinavGrubu/Index/6", plan)
        self.assertFalse(ok)
        self.assertIn("host", reason)

    def test_tuik_dataset_surface_manual_review(self):
        tuik = get_source_profile(self.registry, "tuik_medical_public_health")
        # TÜİK is now read from the official server-rendered home-page bulletin slider (data portal is a JS-only shell).
        self.assertEqual(tuik["fetch_plan"]["source_health"], "HEALTHY")
        surfaces = {s["id"]: s for s in tuik["fetch_plan"]["surfaces"]}
        self.assertEqual(surfaces["home_slider"]["url"], "https://www.tuik.gov.tr/")
        self.assertTrue(tuik.get("item_url_patterns"))

    def test_resmi_gazete_two_stage_unclear_impact(self):
        profile = get_source_profile(self.registry, "resmi_gazete_medical_regulation")
        d = classify_with_congress_gate(
            profile,
            title="Hekimlerin Çalışma Usulleri ile İlgili Düzenleme",
            medical_impact_clear=False,
        )
        self.assertEqual(d.route, "NEEDS_REVIEW")

    def test_congress_discard(self):
        profile = get_source_profile(self.registry, "tuk_specialty_training")
        d = classify_with_congress_gate(
            profile,
            title="Ulusal Kardiyoloji Kongresi Erken Kayıt ve Abstract Çağrısı",
        )
        self.assertEqual(d.decision, "DISCARD")

    def test_low_viral_does_not_downgrade_protected_routes(self):
        for route in ("OPPORTUNITY", "CAREER", "EDUCATION", "PROFESSIONAL_BRIEF", "PUBLIC_HEALTH", "DATA_INSIGHT"):
            self.assertTrue(viral_signal_must_not_downgrade(route, viral_signal=1))


class AnadoluAjansiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.registry = load_phase1_registry(REGISTRY_PATH)
        secs = cls.registry.get("secondary_sources") or []
        cls.aa = next(s for s in secs if s["source_id"] == "anadolu_ajansi_medical_radar")

    def test_aa_profile_secondary_only(self):
        self.assertEqual(self.aa["source_tier"], "SECONDARY_NEWSWIRE")
        self.assertFalse(self.aa.get("publication_eligible"))
        self.assertEqual(self.aa["allowed_routes"], ["NEEDS_REVIEW", "DISCARD"])
        # RSS_STALE_FALLBACK: RSS/site page frozen at 2026-04-26; official news sitemap used instead.
        self.assertEqual(self.aa["fetch_plan"]["source_health"], "HEALTHY")
        self.assertIn("RSS_STALE_FALLBACK", self.aa["fetch_plan"]["notes"])
        self.assertIs(self.aa["fetch_plan"]["tls_verification_required"], True)

    def test_aa_path_gate(self):
        self.assertTrue(aa_path_allowed("https://www.aa.com.tr/tr/saglik/tus-duyurusu/123"))
        self.assertFalse(aa_path_allowed("https://www.aa.com.tr/tr/gundem/haber/1"))
        self.assertFalse(aa_path_allowed("https://www.aa.com.tr/"))

    def test_aa_tus_needs_review_requires_primary(self):
        c = classify_anadolu_ajansi(
            title="ÖSYM TUS başvuru tarihlerini açıkladı",
            url="https://www.aa.com.tr/tr/saglik/osym-tus/1",
        )
        self.assertEqual(c.route, "NEEDS_REVIEW")
        self.assertEqual(c.evidence_status, "needs_primary_check")
        self.assertFalse(c.publication_eligible)
        self.assertFalse(c.auto_publish)

    def test_aa_clinical_study_requires_primary(self):
        c = classify_anadolu_ajansi(
            title="Yeni klinik araştırma tıp dünyasında tartışılıyor",
            url="https://www.aa.com.tr/tr/saglik/arastirma/2",
            primary_url=None,
        )
        self.assertEqual(c.route, "NEEDS_REVIEW")
        self.assertFalse(c.publication_eligible)

    def test_aa_hospital_opening_discard(self):
        c = classify_anadolu_ajansi(
            title="Şehir hastanesi açılış töreni ve yatak kapasitesi artışı",
            url="https://www.aa.com.tr/tr/saglik/hastane/3",
        )
        self.assertEqual(c.decision, "DISCARD")

    def test_aa_miracle_discard(self):
        c = classify_anadolu_ajansi(
            title="Mucize şifa: hasta iyileşti",
            url="https://www.aa.com.tr/tr/saglik/mucize/4",
        )
        self.assertEqual(c.decision, "DISCARD")

    def test_aa_wellness_discard(self):
        c = classify_anadolu_ajansi(
            title="Uzman diyet önerileriyle zayıflama tüyoları",
            url="https://www.aa.com.tr/tr/saglik/diyet/5",
        )
        self.assertEqual(c.decision, "DISCARD")

    def test_aa_public_health_still_needs_primary(self):
        c = classify_anadolu_ajansi(
            title="Bakanlık aşı takvimi güncellemesi hakkında açıklama",
            url="https://www.aa.com.tr/tr/saglik/asi/6",
            primary_url="https://hsgm.saglik.gov.tr/example",
            primary_supports_claim=True,
        )
        self.assertEqual(c.route, "NEEDS_REVIEW")
        self.assertFalse(c.publication_eligible)
        self.assertFalse(c.auto_publish)

    def test_aa_official_duplicate_merge(self):
        c = classify_anadolu_ajansi(
            title="TUS duyurusu",
            url="https://www.aa.com.tr/tr/saglik/tus/7",
            primary_url="https://www.osym.gov.tr/SinavGrubu/Index/6",
            official_already_in_queue=True,
        )
        self.assertEqual(c.decision, "MERGE")
        self.assertEqual(c.primary_url, "https://www.osym.gov.tr/SinavGrubu/Index/6")

    def test_aa_never_auto_publish(self):
        c = classify_anadolu_ajansi(
            title="TUS",
            url="https://www.aa.com.tr/tr/saglik/tus/8",
            primary_url="https://www.osym.gov.tr/x",
            primary_supports_claim=True,
        )
        self.assertFalse(c.auto_publish)
        self.assertFalse(c.publication_eligible)


if __name__ == "__main__":
    unittest.main()
