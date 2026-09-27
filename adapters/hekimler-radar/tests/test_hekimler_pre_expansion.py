"""Hekimler Live Flow Pre-Expansion Hardening — coverage + suite reconciliation."""
from __future__ import annotations

import unittest

from radar.hekimler_coverage import (
    COVERAGE_LOW,
    COVERAGE_NO_ELIGIBLE,
    COVERAGE_SPARSE,
    COVERAGE_WARNING,
    HEALTH_HEALTHY,
    detect_in_scope_signals,
    next_coverage_state,
)
from radar.hekimler_integrity import resolve_effective_registry
from radar.hekimler_registry import get_source_profile


class PreExpansionCoverageTests(unittest.TestCase):
    def test_sparse_but_healthy_source(self):
        profile = {
            "fetch_plan": {
                "coverage_policy": {
                    "sparse_source_allowed": True,
                    "expected_eligible_frequency": "rare",
                    "coverage_watch_window": 14,
                }
            }
        }
        u = next_coverage_state(
            transport_ok=True,
            accepted_count=0,
            previous_streak=10,
            profile=profile,
            in_scope_signal_detected=False,
        )
        self.assertEqual(u.source_health, HEALTH_HEALTHY)
        self.assertEqual(u.coverage_status, COVERAGE_SPARSE)

    def test_likely_in_scope_missed_by_parser_warns(self):
        hits = detect_in_scope_signals(
            titles_and_urls=[
                ("Tıp Fakültesi Kontenjan Güncellemesi", "https://www.yok.gov.tr/x"),
                ("Spor Bilimleri Toplantısı", "https://www.yok.gov.tr/y"),
            ],
            include_keywords=["tıp fakültesi", "hekim"],
        )
        self.assertEqual(len(hits), 1)
        u = next_coverage_state(
            transport_ok=True,
            accepted_count=0,
            previous_streak=0,
            profile={"fetch_plan": {"coverage_policy": {"coverage_watch_window": 3}}},
            in_scope_signal_detected=True,
            in_scope_discarded_count=1,
        )
        self.assertEqual(u.coverage_status, COVERAGE_WARNING)

    def test_expected_content_window_exceeded_dense(self):
        profile = {
            "fetch_plan": {
                "coverage_policy": {
                    "sparse_source_allowed": False,
                    "expected_eligible_frequency": "per_run",
                    "coverage_watch_window": 2,
                    "require_in_scope_for_low_coverage": False,
                }
            }
        }
        u1 = next_coverage_state(
            transport_ok=True, accepted_count=0, previous_streak=0, profile=profile
        )
        self.assertEqual(u1.coverage_status, COVERAGE_NO_ELIGIBLE)
        u2 = next_coverage_state(
            transport_ok=True,
            accepted_count=0,
            previous_streak=u1.zero_accept_streak,
            profile=profile,
        )
        self.assertEqual(u2.coverage_status, COVERAGE_LOW)

    def test_yokak_and_rg_zero_cycles_remain_sparse_healthy(self):
        for sid in ("yokak_medical_accreditation", "resmi_gazete_medical_regulation"):
            profile = get_source_profile(resolve_effective_registry(), sid)
            policy = (profile.get("fetch_plan") or {}).get("coverage_policy") or {}
            self.assertTrue(policy.get("sparse_source_allowed"), sid)
            status = "configured"
            streak = 0
            for _ in range(5):
                u = next_coverage_state(
                    transport_ok=True,
                    accepted_count=0,
                    previous_streak=streak,
                    previous_coverage=status,
                    profile=profile,
                )
                status = u.coverage_status
                streak = u.zero_accept_streak
            self.assertEqual(status, COVERAGE_SPARSE, sid)
            self.assertEqual(u.source_health, HEALTH_HEALTHY, sid)

    def test_global_medical_gate_unchanged_by_coverage_policy(self):
        from radar.hekimler_registry import classify_item

        osym = get_source_profile(resolve_effective_registry(), "osym_medical_exams")
        d = classify_item(osym, title="KPSS Genel Yetenek Duyurusu", body="")
        self.assertEqual(d.decision, "DISCARD")
        a = classify_item(osym, title="2026 TUS 1. Dönem Başvuru Tarihleri", body="")
        self.assertEqual(a.decision, "ACCEPT")


class SuiteReconciliationTests(unittest.TestCase):
    def test_canonical_suite_includes_phase1_canary(self):
        """Document: prior 154 counted hekimler* + phase1; 148 was hekimler* alone."""
        import unittest

        loader = unittest.defaultTestLoader
        hekimler = loader.discover("tests", pattern="test_hekimler*.py").countTestCases()
        phase1 = loader.loadTestsFromName("tests.test_phase1_ingestion_canary").countTestCases()
        self.assertGreaterEqual(hekimler, 140)
        self.assertGreaterEqual(phase1, 20)
        # Canonical related total must exceed the incomplete hekimler*-only count
        self.assertGreater(hekimler + phase1, hekimler)


if __name__ == "__main__":
    unittest.main()
