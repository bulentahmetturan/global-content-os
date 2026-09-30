"""Primary pipeline contract (production-readiness spec, 2026-09-27):

ACTIVE+ENABLED+WIRED   -> eligible for automatic ingestion
MANUAL_INTAKE/DISABLED -> NOT eligible
CONFIGURED_NOT_WIRED   -> NOT eligible
RETIRED                -> NOT eligible (structurally BLOCKED)
BROKEN/INVALID/UNKNOWN -> fail closed, NOT eligible

This uses synthetic minimal profiles (not real registry data) so the
contract itself is pinned independently of which real sources happen to be
in which state today.
"""
from __future__ import annotations

import unittest

from radar.tip_toplulugu_activation import (
    ACTIVATION_AUTOMATION_READY,
    ACTIVATION_BLOCKED,
    ACTIVATION_MANUAL_INTAKE,
    compute_activation_state,
)


def _base_ready_profile(**overrides):
    profile = {
        "source_id": "synthetic_ready_source",
        "status": "active",
        "runtime_activation": None,
        "fetch_enabled": True,
        "scheduled_fetch_enabled": True,
        "candidate_emission_enabled": True,
        "pipeline_wiring_enabled": True,
        "publication_eligible": False,
        "fetch_mode": "list-page",
        "include_keywords": ["hekim"],
        "fetch_plan": {
            "tls_verification_required": True,
            "allowed_hostnames": ["example.org"],
            "allowed_path_patterns": ["/news/"],
            "source_health": "HEALTHY",
        },
    }
    profile.update(overrides)
    return profile


def is_eligible_for_automatic_ingestion(profile: dict) -> bool:
    """The single source of truth this test pins: only AUTOMATION_READY may
    auto-ingest. Mirrors the real selection path (select_automation_ready_due
    only ever schedules AUTOMATION_READY sources)."""
    return compute_activation_state(profile) == ACTIVATION_AUTOMATION_READY


class LifecycleEligibilityContractTests(unittest.TestCase):
    def test_active_enabled_wired_is_eligible(self):
        profile = _base_ready_profile()
        self.assertEqual(compute_activation_state(profile), ACTIVATION_AUTOMATION_READY)
        self.assertTrue(is_eligible_for_automatic_ingestion(profile))

    def test_manual_intake_is_not_eligible(self):
        profile = _base_ready_profile(
            status="active",
            runtime_activation="MANUAL_INTAKE",
            fetch_enabled=False,
        )
        self.assertEqual(compute_activation_state(profile), ACTIVATION_MANUAL_INTAKE)
        self.assertFalse(is_eligible_for_automatic_ingestion(profile))

    def test_disabled_fetch_flag_is_not_eligible_even_without_explicit_manual_intake(self):
        profile = _base_ready_profile(runtime_activation=None, fetch_enabled=False)
        self.assertNotEqual(compute_activation_state(profile), ACTIVATION_AUTOMATION_READY)
        self.assertFalse(is_eligible_for_automatic_ingestion(profile))

    def test_configured_not_wired_is_not_eligible(self):
        # Real-world shape: abroad_us_ecfmg_intealth / abroad_de_make_it_in_germany
        # (source-registry-abroad-career-v1.json) -- BLOCKED_EXTERNAL bot walls,
        # intentionally left unwired, never bypassed.
        profile = _base_ready_profile(
            status="configured_not_wired",
            fetch_mode="not_wired",
            runtime_activation="MANUAL_INTAKE",
            fetch_enabled=False,
            scheduled_fetch_enabled=False,
            candidate_emission_enabled=False,
            pipeline_wiring_enabled=False,
        )
        self.assertEqual(compute_activation_state(profile), ACTIVATION_MANUAL_INTAKE)
        self.assertFalse(is_eligible_for_automatic_ingestion(profile))

    def test_retired_is_structurally_blocked_not_eligible(self):
        # Real-world shape: anadolu_ajansi_medical_radar after S57.
        profile = _base_ready_profile(status="retired", runtime_activation="AUTOMATION_READY")
        self.assertEqual(compute_activation_state(profile), ACTIVATION_BLOCKED)
        self.assertFalse(is_eligible_for_automatic_ingestion(profile))

    def test_retired_overrides_an_explicit_automation_ready_forcing(self):
        """A source cannot be made eligible merely by setting
        runtime_activation=AUTOMATION_READY while status=retired -- status
        wins. This is the exact mechanism S57's aa.com.tr fix depends on."""
        profile = _base_ready_profile(
            status="retired",
            runtime_activation="AUTOMATION_READY",
            fetch_enabled=True,
            scheduled_fetch_enabled=True,
            candidate_emission_enabled=True,
            pipeline_wiring_enabled=True,
        )
        self.assertEqual(compute_activation_state(profile), ACTIVATION_BLOCKED)

    def test_unknown_or_missing_status_fails_closed_to_manual_intake(self):
        profile = _base_ready_profile(status="", runtime_activation=None, fetch_enabled=False)
        self.assertEqual(compute_activation_state(profile), ACTIVATION_MANUAL_INTAKE)
        self.assertFalse(is_eligible_for_automatic_ingestion(profile))

    def test_blocked_source_id_prefix_is_never_eligible_even_if_everything_else_looks_ready(self):
        from radar.tip_toplulugu_activation import BLOCKED_SOURCE_ID_PREFIXES

        if not BLOCKED_SOURCE_ID_PREFIXES:
            self.skipTest("no blocked source id prefixes configured")
        prefix = next(iter(BLOCKED_SOURCE_ID_PREFIXES))
        profile = _base_ready_profile(source_id=f"{prefix}anything")
        self.assertEqual(compute_activation_state(profile), ACTIVATION_BLOCKED)


if __name__ == "__main__":
    unittest.main()
