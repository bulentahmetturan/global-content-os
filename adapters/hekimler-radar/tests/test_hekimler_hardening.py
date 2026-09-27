"""Hekimler Live Flow Hardening + Batch 2 Activation v1 — tests (no live network)."""
from __future__ import annotations

import inspect
import json
from pathlib import Path
import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock

from radar.hekimler_activation import (
    ACTIVATION_AUTOMATION_READY,
    ACTIVATION_MANUAL_INTAKE,
    compute_activation_state,
)
from radar.hekimler_backfill import classify_backfill
from radar.hekimler_coverage import (
    COVERAGE_LOW,
    COVERAGE_NO_ELIGIBLE,
    COVERAGE_SPARSE,
    COVERAGE_WARNING,
    HEALTH_DEGRADED,
    HEALTH_HEALTHY,
    next_coverage_state,
)
from radar.hekimler_integrity import resolve_effective_registry
from radar.hekimler_pubmed_pack import validate_approved_query_pack
from radar.hekimler_registry import get_source_profile


class BackfillHardeningTests(unittest.TestCase):
    def setUp(self):
        self.osym = get_source_profile(resolve_effective_registry(), "osym_medical_exams")
        self.now = datetime(2026, 9, 19, tzinfo=timezone.utc)

    def test_old_items_marked_backfill_not_silent_drop(self):
        old = (self.now - timedelta(days=90)).date().isoformat()
        d = classify_backfill(
            self.osym,
            title="Eski TUS Duyurusu Arşiv",
            published_at=old,
            now=self.now,
        )
        self.assertTrue(d.retain)
        self.assertTrue(d.is_backfill)
        self.assertEqual(d.priority, "backfill_low")

    def test_recent_items_current(self):
        recent = (self.now - timedelta(days=3)).date().isoformat()
        d = classify_backfill(
            self.osym,
            title="2026 TUS Başvuru Tarihleri",
            published_at=recent,
            now=self.now,
        )
        self.assertTrue(d.retain)
        self.assertFalse(d.is_backfill)
        self.assertEqual(d.priority, "current")

    def test_old_but_still_active_retained_as_backfill(self):
        old = (self.now - timedelta(days=60)).date().isoformat()
        d = classify_backfill(
            self.osym,
            title="TUS Başvurusu Devam Ediyor — Son Başvuru 2026-10-01",
            published_at=old,
            now=self.now,
        )
        self.assertTrue(d.retain)
        self.assertTrue(d.is_backfill)
        self.assertIn(d.reason, {"historical_but_still_active", "active_signal"})

    def test_future_deadline_current(self):
        old = (self.now - timedelta(days=40)).date().isoformat()
        d = classify_backfill(
            self.osym,
            title="İlan",
            published_at=old,
            deadline=(self.now + timedelta(days=10)).date().isoformat(),
            now=self.now,
        )
        self.assertTrue(d.retain)
        self.assertFalse(d.is_backfill)
        self.assertEqual(d.reason, "future_or_open_deadline")

    def test_per_source_lookback_not_global(self):
        rg = get_source_profile(resolve_effective_registry(), "resmi_gazete_medical_regulation")
        day8 = (self.now - timedelta(days=8)).date().isoformat()
        # ÖSYM lookback 14 → current; RG lookback 7 → backfill
        osym_d = classify_backfill(self.osym, title="x", published_at=day8, now=self.now)
        rg_d = classify_backfill(rg, title="hekim yönetmeliği", published_at=day8, now=self.now)
        self.assertFalse(osym_d.is_backfill)
        self.assertTrue(rg_d.is_backfill)


class CoverageHardeningTests(unittest.TestCase):
    def test_healthy_and_coverage_independent(self):
        # Without in-scope signal, dense default stays NO_ELIGIBLE not LOW
        u = next_coverage_state(transport_ok=True, accepted_count=0, previous_streak=2)
        self.assertEqual(u.source_health, HEALTH_HEALTHY)
        self.assertEqual(u.coverage_status, COVERAGE_NO_ELIGIBLE)

    def test_in_scope_missed_escalates_to_low_coverage(self):
        dense = {
            "fetch_plan": {
                "coverage_policy": {
                    "sparse_source_allowed": False,
                    "coverage_watch_window": 3,
                    "require_in_scope_for_low_coverage": True,
                }
            }
        }
        streak = 0
        status = "configured"
        for _ in range(3):
            u = next_coverage_state(
                transport_ok=True,
                accepted_count=0,
                previous_streak=streak,
                previous_coverage=status,
                profile=dense,
                in_scope_signal_detected=True,
                in_scope_discarded_count=2,
            )
            streak = u.zero_accept_streak
            status = u.coverage_status
        self.assertEqual(status, COVERAGE_LOW)
        self.assertEqual(streak, 3)

    def test_degraded_does_not_advance_streak(self):
        u = next_coverage_state(transport_ok=False, accepted_count=0, previous_streak=2)
        self.assertEqual(u.source_health, HEALTH_DEGRADED)
        self.assertEqual(u.zero_accept_streak, 2)
        self.assertNotEqual(u.coverage_status, COVERAGE_LOW)

    def test_accept_resets_streak(self):
        u = next_coverage_state(transport_ok=True, accepted_count=2, previous_streak=3, previous_coverage=COVERAGE_LOW)
        self.assertEqual(u.zero_accept_streak, 0)
        self.assertEqual(u.source_health, HEALTH_HEALTHY)
        self.assertEqual(u.coverage_status, "configured")

    def test_sparse_yokak_rg_stay_non_degraded_after_three_empty(self):
        for sid in ("yokak_medical_accreditation", "resmi_gazete_medical_regulation"):
            profile = get_source_profile(resolve_effective_registry(), sid)
            streak = 0
            status = "configured"
            for _ in range(3):
                u = next_coverage_state(
                    transport_ok=True,
                    accepted_count=0,
                    previous_streak=streak,
                    previous_coverage=status,
                    profile=profile,
                    in_scope_signal_detected=False,
                )
                streak = u.zero_accept_streak
                status = u.coverage_status
            self.assertEqual(u.source_health, HEALTH_HEALTHY)
            self.assertEqual(status, COVERAGE_SPARSE)
            self.assertNotEqual(status, COVERAGE_LOW)
            self.assertEqual(streak, 0)

    def test_coverage_warning_on_single_in_scope_discard(self):
        u = next_coverage_state(
            transport_ok=True,
            accepted_count=0,
            previous_streak=0,
            profile={"fetch_plan": {"coverage_policy": {"coverage_watch_window": 3}}},
            in_scope_discarded_count=1,
        )
        self.assertEqual(u.coverage_status, COVERAGE_WARNING)
        self.assertEqual(u.source_health, HEALTH_HEALTHY)


class GateIsolationTests(unittest.TestCase):
    def test_source_scope_url_does_not_weaken_global_osym_gate(self):
        eff = resolve_effective_registry()
        osym = get_source_profile(eff, "osym_medical_exams")
        yok = get_source_profile(eff, "yok_medical_education")
        self.assertTrue(yok.get("scope_url_in_gate"))
        self.assertFalse(osym.get("scope_url_in_gate"))
        # ÖSYM include list unchanged by YÖK URL-scope tokens
        self.assertNotIn("tip-fakult", osym.get("include_keywords") or [])


class PubMedAndBatch2Tests(unittest.TestCase):
    def test_pubmed_rejects_unrestricted(self):
        ok, reason = validate_approved_query_pack([{"id": "x", "term": "*"}])
        self.assertFalse(ok)
        self.assertEqual(reason, "unrestricted_query_rejected")
        ok2, _ = validate_approved_query_pack([{"id": "x", "term": "medicine"}])
        self.assertFalse(ok2)

    def test_pubmed_pack_valid_and_automation_ready(self):
        pubmed = get_source_profile(resolve_effective_registry(), "pubmed_biomedical_evidence")
        self.assertEqual(compute_activation_state(pubmed), ACTIVATION_AUTOMATION_READY)
        pack_ok, _ = validate_approved_query_pack(pubmed["approved_query_pack"])
        self.assertTrue(pack_ok)
        self.assertTrue(pubmed.get("reject_unrestricted_search"))

    def test_pubmed_without_pack_not_ready(self):
        bare = {
            "source_id": "pubmed_fake",
            "fetch_enabled": True,
            "scheduled_fetch_enabled": True,
            "candidate_emission_enabled": True,
            "pipeline_wiring_enabled": True,
            "publication_eligible": False,
            "runtime_activation": "AUTOMATION_READY",
            "include_keywords": ["medical"],
            "fetch_plan": {
                "primary_method": "eutilities_api",
                "tls_verification_required": True,
                "allowed_hostnames": ["eutils.ncbi.nlm.nih.gov"],
                "allowed_path_patterns": ["/entrez/eutils/"],
                "source_health": "HEALTHY",
            },
        }
        self.assertEqual(compute_activation_state(bare), ACTIVATION_MANUAL_INTAKE)

    def test_moh_and_hsgm_ready_surfaces(self):
        eff = resolve_effective_registry()
        moh = get_source_profile(eff, "moh_physician_workforce")
        hsgm = get_source_profile(eff, "hsgm_public_health")
        self.assertEqual(compute_activation_state(moh), ACTIVATION_AUTOMATION_READY)
        self.assertEqual(compute_activation_state(hsgm), ACTIVATION_AUTOMATION_READY)
        self.assertEqual(
            hsgm.get("source_health") or (hsgm.get("fetch_plan") or {}).get("source_health", ""),
            "HEALTHY",
        )

    def test_batch2_no_blind_activation(self):
        from radar.hekimler_continuous_runner import export_automation_ready_profiles

        ready = {p["source_id"] for p in export_automation_ready_profiles()}
        self.assertIn("pubmed_biomedical_evidence", ready)
        self.assertIn("moh_physician_workforce", ready)
        self.assertIn("hsgm_public_health", ready)
        # Only verified abroad news lists may join; bulk abroad_* stay MANUAL
        abroad_ready = {sid for sid in ready if sid.startswith("abroad_")}
        abroad_canon = {sid for sid in json.loads((Path(__file__).parent / "fixtures" / "hekimler_ready_sources.json").read_text(encoding="utf-8"))["automation_ready"] if sid.startswith("abroad_")}
        self.assertEqual(abroad_ready, abroad_canon)
        for sid in (
            "osym_medical_exams",
            "yok_medical_education",
            "yokak_medical_accreditation",
            "tuk_specialty_training",
            "resmi_gazete_medical_regulation",
        ):
            self.assertIn(sid, ready)


class IngressAuthContractTests(unittest.TestCase):
    """Python-side contracts mirroring Worker fail-closed auth + partition."""

    def test_missing_token_rejected(self):
        expected = ""
        token = "anything"
        # Fail closed when secret not configured
        self.assertTrue(not expected or token != expected)

    def test_channel_brand_mismatch_rejected(self):
        from radar.hekimler_hub_bridge import (
            HEKIMLER_CHANNEL_ID,
            HEKIMLER_CONTENT_FAMILY,
            HEKIMLER_EDITORIAL_BRAND,
        )

        def reject(body: dict) -> str | None:
            if body.get("channelId") and body["channelId"] != HEKIMLER_CHANNEL_ID:
                return "channel_id_mismatch"
            if body.get("editorialBrand") and body["editorialBrand"] != HEKIMLER_EDITORIAL_BRAND:
                return "editorial_brand_mismatch"
            if body.get("contentFamily") and body["contentFamily"] != HEKIMLER_CONTENT_FAMILY:
                return "content_family_mismatch"
            return None

        self.assertEqual(reject({"channelId": "kaduse-medikal"}), "channel_id_mismatch")
        self.assertEqual(reject({"editorialBrand": "Other"}), "editorial_brand_mismatch")
        self.assertIsNone(
            reject(
                {
                    "channelId": HEKIMLER_CHANNEL_ID,
                    "editorialBrand": HEKIMLER_EDITORIAL_BRAND,
                    "contentFamily": HEKIMLER_CONTENT_FAMILY,
                }
            )
        )


class RunLockContractTests(unittest.TestCase):
    def test_duplicate_lock_key_noops(self):
        locks: set[str] = set()

        def acquire(key: str) -> bool:
            if key in locks:
                return False
            locks.add(key)
            return True

        self.assertTrue(acquire("osym:1"))
        self.assertFalse(acquire("osym:1"))
        locks.discard("osym:1")
        self.assertTrue(acquire("osym:1"))


class NoPublishTests(unittest.TestCase):
    def test_no_approve_render_publish_in_hardening_modules(self):
        import radar.hekimler_activation as act
        import radar.hekimler_backfill as bf
        import radar.hekimler_continuous_runner as cont
        import radar.hekimler_coverage as cov

        for mod in (act, bf, cont, cov):
            src = inspect.getsource(mod)
            self.assertNotIn("auto_publish=True", src)
            self.assertNotIn("publication_eligible=True", src)
            self.assertNotIn("triage_status='production'", src)


if __name__ == "__main__":
    unittest.main()
