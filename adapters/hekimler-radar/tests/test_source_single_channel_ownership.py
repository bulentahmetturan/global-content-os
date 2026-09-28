"""S57 — single-channel-per-source enforcement regression.

resmigazete.gov.tr and aa.com.tr were each independently registered on
BOTH the Kaduse (Haber) side and the Hekimler (Duyuru) side, fetching the
same URL/path with only a downstream keyword filter as the differentiator.
User decision (2026-09-26): resmigazete.gov.tr -> Duyuru (Hekimler)
exclusively; aa.com.tr -> Haber (Kaduse) exclusively. This must be a
structural block (registry lifecycle state), never a keyword gate.
"""
from __future__ import annotations

import re
import unittest
from pathlib import Path

from radar.hekimler_activation import ACTIVATION_BLOCKED, compute_activation_state
from radar.hekimler_integrity import resolve_effective_registry
from radar.hekimler_registry import get_source_profile, load_phase1_registry, load_v11_registry

ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = ROOT.parents[1]


class AaComTrRetiredOnHekimlerSideTests(unittest.TestCase):
    """aa.com.tr belongs to Kaduse (Haber) exclusively -- Hekimler's
    secondary registration must be structurally blocked, not merely
    keyword-filtered."""

    def test_phase1_profile_is_retired_and_blocked(self):
        registry = load_phase1_registry()
        profile = get_source_profile(registry, "anadolu_ajansi_medical_radar")
        self.assertEqual(profile.get("status"), "retired")
        self.assertEqual(compute_activation_state(profile), ACTIVATION_BLOCKED)

    def test_v11_profile_is_retired_and_blocked(self):
        registry = load_v11_registry()
        profile = get_source_profile(registry, "anadolu_ajansi_medical_radar")
        self.assertEqual(profile.get("status"), "retired")
        self.assertEqual(compute_activation_state(profile), ACTIVATION_BLOCKED)

    def test_effective_registry_still_blocks_it(self):
        """The merged phase1+v1.1(+overlays) effective registry used by the
        real activation/fetch selection path must also see it as retired,
        not just the raw per-file profile."""
        effective = resolve_effective_registry()
        profile = get_source_profile(effective, "anadolu_ajansi_medical_radar")
        self.assertEqual(profile.get("status"), "retired")
        self.assertEqual(compute_activation_state(profile), ACTIVATION_BLOCKED)

    def test_not_gated_by_keyword_filter_alone(self):
        """The block must be the lifecycle `status` field, not merely an
        include/exclude keyword list -- a keyword gate would still let the
        fetcher poll the URL and would violate the user's explicit
        no-keyword-filter-sharing instruction."""
        registry = load_phase1_registry()
        profile = get_source_profile(registry, "anadolu_ajansi_medical_radar")
        # Removing status still yields BLOCKED only because of status; prove
        # the keyword fields are NOT what's doing the blocking by checking
        # status is the actual field compute_activation_state inspects.
        stripped = dict(profile)
        stripped["status"] = "active"
        # With status flipped back to active this source has real
        # fetch/scheduler/candidate-emission gates set, so it would NOT be
        # BLOCKED anymore -- confirming `status` (not a keyword gate) is
        # the sole mechanism holding it retired.
        self.assertNotEqual(compute_activation_state(stripped), ACTIVATION_BLOCKED)


class ResmiGazeteKaduseSideDisabledTests(unittest.TestCase):
    """resmigazete.gov.tr belongs to Hekimler (Duyuru) exclusively -- the
    Kaduse-side D1 feed row must be structurally disabled (enabled=0), not
    filtered by keyword, so the generic-web ingress fetcher's own
    `WHERE enabled = 1` selection can never return it."""

    def test_migration_disables_kaduse_side_feed_row(self):
        migration = (REPO_ROOT / "migrations" / "0022_resmi_gazete_single_channel.sql").read_text(
            encoding="utf-8"
        )
        self.assertRegex(migration, r"UPDATE\s+source_feeds")
        self.assertRegex(migration, r"SET\s+enabled\s*=\s*0")
        self.assertIn("news-resmi-gazete-health-scoped", migration)

    def test_seed_still_defines_the_row_route_as_kaduse_news(self):
        """Sanity check: the row this migration disables really is the
        Kaduse-side (route=kaduse-news) registration, not the Hekimler one."""
        seed = (REPO_ROOT / "migrations" / "0002_seed_all_feeds.sql").read_text(encoding="utf-8")
        match = re.search(
            r"\('news-resmi-gazete-health-scoped',[^\n]*'kaduse-news'[^\n]*\)", seed
        )
        self.assertIsNotNone(
            match, "expected news-resmi-gazete-health-scoped seeded on route=kaduse-news"
        )

    def test_hekimler_side_registration_is_untouched(self):
        """The Hekimler-side ADAPTER_PUSH row (tip-resmi_gazete) must remain
        enabled -- Hekimler keeps sole ownership of this domain."""
        seed = (REPO_ROOT / "migrations" / "0002_seed_all_feeds.sql").read_text(encoding="utf-8")
        match = re.search(r"\('tip-resmi_gazete',[^\n]*\)", seed)
        self.assertIsNotNone(match)
        self.assertIn("'tip-ogrencileri'", match.group(0))
        # Column order: id, label, route, channelId, transport, endpointUrl,
        # pollMinutes, enabled, externalRef, rules -- 8th positional value.
        cols = re.findall(r"'[^']*'|\d+", match.group(0))
        self.assertEqual(cols[7], "1", "tip-resmi_gazete must stay enabled=1")


if __name__ == "__main__":
    unittest.main()
