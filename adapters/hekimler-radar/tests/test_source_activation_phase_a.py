"""S66 Phase A -- individually researched and activated MANUAL_INTAKE
sources (2026-09-28). Each activation here required: (1) a real WebFetch-
based investigation of the actual official update surface, (2) a live
radar.fetchers.fetch() canary proving HTTP 200 + real extractable content
with no bot-wall, (3) the full automation_ready_gates() requirements
(fetch_plan with tls_verification_required + allowed_hostnames/paths,
a verified fetch method, a policy gate). Not a bulk/blanket enable -- see
each source's `activation_note` in its registry JSON for the specific
verification evidence.
"""
from __future__ import annotations

import unittest

from radar.hekimler_activation import (
    ACTIVATION_AUTOMATION_READY,
    automation_ready_gates,
    compute_activation_state,
)
from radar.hekimler_integrity import resolve_effective_registry, resolve_profile


class SourceActivationPhaseATests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.eff = resolve_effective_registry()

    def test_burs_uk_chevening_is_automation_ready(self):
        profile = resolve_profile("burs_uk_chevening", self.eff)
        self.assertEqual(compute_activation_state(profile), ACTIVATION_AUTOMATION_READY)
        ok, failures = automation_ready_gates(profile)
        self.assertTrue(ok, failures)

    def test_burs_uk_chevening_has_a_dated_verification_note(self):
        profile = resolve_profile("burs_uk_chevening", self.eff)
        note = profile.get("activation_note") or ""
        self.assertIn("2026-09-28", note)
        self.assertIn("HTTP 200", note)

    def test_burs_uk_chevening_points_at_the_turkey_specific_page(self):
        # The general /scholarships/ landing page doesn't carry the
        # actionable deadline text -- the country page does (verified via
        # WebFetch + a live fetch canary during this activation).
        profile = resolve_profile("burs_uk_chevening", self.eff)
        self.assertIn("turkey", (profile.get("canonical_url") or "").lower())

    def test_burs_eau_eusp_is_automation_ready(self):
        # S69 canary batch (2026-09-29).
        profile = resolve_profile("burs_eau_eusp", self.eff)
        self.assertEqual(compute_activation_state(profile), ACTIVATION_AUTOMATION_READY)
        ok, failures = automation_ready_gates(profile)
        self.assertTrue(ok, failures)

    def test_burs_eau_eusp_has_a_dated_verification_note(self):
        profile = resolve_profile("burs_eau_eusp", self.eff)
        note = profile.get("activation_note") or ""
        self.assertIn("2026-09-29", note)
        self.assertIn("HTTP 200", note)


if __name__ == "__main__":
    unittest.main()
