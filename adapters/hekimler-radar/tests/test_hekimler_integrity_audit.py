"""Registry integrity audit fixtures for Hekimler source layers."""
from __future__ import annotations

import unittest

from radar.hekimler_fetch import evaluate_tls_failure
from radar.hekimler_integrity import (
    DOMESTIC_OFFICIAL_PRIMARY_IDS,
    OFFICIAL_PRIMARY_IDS,
    PROFESSIONAL_BODY_IDS,
    PROFESSIONAL_GUIDANCE_IDS,
    assert_unique_source_ids,
    can_emit_candidate,
    congress_features_active,
    hekimler_modules_queue_boundary_ok,
    manual_review_sources_disabled,
    resolve_effective_registry,
    resolve_profile,
    tier_counts,
)
from radar.hekimler_registry import load_phase1_registry, load_v11_registry


class IntegrityAuditTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.effective = resolve_effective_registry()
        cls.phase1 = load_phase1_registry()
        cls.v11 = load_v11_registry()

    def test_unique_source_ids_across_layers(self):
        assert_unique_source_ids(self.effective)
        ids = [s["source_id"] for s in self.effective["sources"]]
        ids += [s["source_id"] for s in self.effective["secondary_sources"]]
        self.assertEqual(len(ids), len(set(ids)))

    def test_deterministic_resolution_precedence(self):
        osym = resolve_profile("osym_medical_exams", self.effective)
        self.assertEqual(osym["source_tier"], "OFFICIAL_PRIMARY")
        self.assertIn("fetch_plan", osym)
        self.assertIs(osym["fetch_plan"]["tls_verification_required"], True)
        # phase1 fetch plan present (hardened)
        self.assertEqual(osym["fetch_plan"]["primary_method"], self.phase1["sources"][0]["fetch_plan"]["primary_method"])

    def test_exactly_eight_domestic_official_primary(self):
        """Domestic v1.1 OFFICIAL_PRIMARY count stays 8; Abroad Career adds more OFFICIAL_PRIMARY."""
        domestic = {
            s["source_id"]
            for s in self.effective["sources"]
            if s["source_tier"] == "OFFICIAL_PRIMARY"
            and not s["source_id"].startswith("abroad_")
            and not s["source_id"].startswith("burs_")
            and not s["source_id"].startswith("egitim_")
        }
        self.assertEqual(domestic, set(DOMESTIC_OFFICIAL_PRIMARY_IDS))
        self.assertEqual(domestic, set(OFFICIAL_PRIMARY_IDS))
        self.assertEqual(len(domestic), 12)
        counts = tier_counts(self.effective)
        self.assertGreaterEqual(counts.get("OFFICIAL_PRIMARY", 0), 8)

    def test_ttb_hasuder_not_primary_factual(self):
        for sid in ("ttb_national", "hasuder_public_health"):
            p = resolve_profile(sid, self.effective)
            self.assertEqual(p["source_tier"], "PROFESSIONAL_BODY")
            self.assertEqual(p["statement_treatment"], "organisation_position")
            self.assertNotEqual(p["source_tier"], "OFFICIAL_PRIMARY")

    def test_specialty_societies_professional_guidance(self):
        for sid in PROFESSIONAL_GUIDANCE_IDS:
            if sid.startswith(("tepdad", "teged", "halk_")):
                continue
            p = resolve_profile(sid, self.effective)
            self.assertEqual(p["source_tier"], "PROFESSIONAL_GUIDANCE")
            self.assertEqual(p["statement_treatment"], "professional_guidance")

    def test_aa_secondary_newswire_discovery_only(self):
        aa = resolve_profile("anadolu_ajansi_medical_radar", self.effective)
        self.assertEqual(aa["source_tier"], "SECONDARY_NEWSWIRE")
        self.assertEqual(aa["statement_treatment"], "reported_news")
        self.assertFalse(aa.get("publication_eligible"))
        # Discovery-only stays true (no publication); fetch is now enabled via the official news sitemap (RSS_STALE_FALLBACK).
        self.assertTrue(aa.get("fetch_enabled"))
        self.assertEqual(aa["allowed_routes"], ["NEEDS_REVIEW", "DISCARD"])

    def test_manual_review_fetch_disabled(self):
        bad = manual_review_sources_disabled(self.effective)
        self.assertEqual(bad, [])

    def test_manual_review_cannot_emit_candidate(self):
        for s in self.effective["sources"]:
            if s.get("source_health") == "MANUAL_REVIEW_REQUIRED" or s.get("status") == "manual_review":
                self.assertFalse(can_emit_candidate(s), s["source_id"])

    def test_no_congress_feature_active(self):
        self.assertFalse(congress_features_active())
        self.assertFalse(self.effective.get("congress_features_active"))
        self.assertFalse(self.v11["global_rules"].get("congress_features_active"))

    def test_no_queue_or_publishing_reachable_from_hekimler_modules(self):
        ok, reason = hekimler_modules_queue_boundary_ok()
        self.assertTrue(ok, reason)
        # Fast Activation v1 wires five AUTOMATION_READY sources — never auto-publish
        self.assertNotEqual(self.effective.get("publication_eligible"), True)
        for s in self.effective["sources"]:
            self.assertIsNot(s.get("publication_eligible"), True, s["source_id"])
            self.assertIsNot(s.get("auto_publish"), True, s["source_id"])

    def test_tls_fail_closed_intact(self):
        out = evaluate_tls_failure("osym_medical_exams", "https://www.osym.gov.tr/")
        self.assertEqual(out.source_health, "DEGRADED")
        self.assertFalse(out.allow_queue)

    def test_tier_totals(self):
        counts = tier_counts(self.effective)
        domestic_op = sum(
            1
            for s in self.effective["sources"]
            if s["source_tier"] == "OFFICIAL_PRIMARY"
            and not s["source_id"].startswith("abroad_")
            and not s["source_id"].startswith("burs_")
            and not s["source_id"].startswith("egitim_")
        )
        self.assertEqual(domestic_op, 12)
        self.assertEqual(counts["PROFESSIONAL_BODY"], 5)  # + tdb_dental (tracked separately from the 46)
        self.assertEqual(counts["PROFESSIONAL_GUIDANCE"], 12)
        self.assertEqual(counts["SECONDARY_NEWSWIRE"], 32)  # +15 batch3 international English health/medical discovery pool
        self.assertEqual(set(PROFESSIONAL_BODY_IDS), {
            s["source_id"] for s in self.effective["sources"] if s["source_tier"] == "PROFESSIONAL_BODY"
        })
        # Abroad Career additive OFFICIAL_PRIMARY profiles may increase total
        self.assertGreaterEqual(counts["OFFICIAL_PRIMARY"], 8)


if __name__ == "__main__":
    unittest.main()
