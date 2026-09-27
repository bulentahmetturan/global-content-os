"""Domestic batch activation — TurkMSIC / TTB / HSGM / Klimik / TRD; TPD stays MANUAL."""
from __future__ import annotations

import unittest

from radar.hekimler_activation import (
    ACTIVATION_AUTOMATION_READY,
    ACTIVATION_MANUAL_INTAKE,
    compute_activation_state,
)
from radar.hekimler_continuous_runner import export_automation_ready_profiles
from radar.hekimler_integrity import resolve_effective_registry
from radar.hekimler_registry import classify_item, get_source_profile


def _host_path_ok(profile: dict, url: str) -> bool:
    from urllib.parse import urlparse

    plan = profile.get("fetch_plan") or {}
    u = urlparse(url)
    host = (u.hostname or "").lower()
    path = u.path or "/"
    forbidden = [h.lower() for h in (plan.get("forbidden_hosts") or [])]
    if host in forbidden:
        return False
    hosts = [h.lower() for h in (plan.get("allowed_hostnames") or [])]
    if host not in hosts:
        return False
    patterns = plan.get("allowed_path_patterns") or ["/"]
    specific = [p for p in patterns if p != "/"]
    if specific and path in {"/", "/tr", "/tr/"}:
        return False
    return any(p == "/" or path.startswith(p) or p in path for p in patterns)


class DomesticPassActivationTests(unittest.TestCase):
    def setUp(self):
        self.eff = resolve_effective_registry()

    def test_new_ready_sources(self):
        for sid, sample in (
            ("turkmsic_medical_students", "https://turkmsic.org/haberler"),
            ("ttb_national", "https://www.ttb.org.tr/arsiv_duyuru.php"),
            ("hsgm_public_health", "https://hsgm.saglik.gov.tr/tr/basin-odasi/basin-odasi-haberler.html"),
            ("klimık_infectious_diseases", "https://www.klimik.org.tr/category/duyurular/"),
            ("trd_radiology", "https://www.turkrad.org.tr/dernekten-haberler/"),
        ):
            profile = get_source_profile(self.eff, sid)
            self.assertEqual(compute_activation_state(profile), ACTIVATION_AUTOMATION_READY, sid)
            self.assertTrue(_host_path_ok(profile, sample), sid)
            self.assertFalse(_host_path_ok(profile, f"https://{(profile.get('fetch_plan') or {}).get('allowed_hostnames', ['x'])[0]}/"))

    def test_hsgm_homepage_and_mevzuat_not_primary(self):
        hsgm = get_source_profile(self.eff, "hsgm_public_health")
        self.assertFalse(_host_path_ok(hsgm, "https://hsgm.saglik.gov.tr/tr/"))
        self.assertFalse(_host_path_ok(hsgm, "https://hsgm.saglik.gov.tr/tr/mevzuat.html"))

    def test_tpd_ready_only_with_item_path_allowlist_and_date_policy(self):
        # 3000+ site-wide anchors: safe only because item_url_patterns pin the post shape
        # and the D9 date policy drops the historical archive.
        tpd = get_source_profile(self.eff, "tpd_psychiatry")
        self.assertEqual(compute_activation_state(tpd), ACTIVATION_AUTOMATION_READY)
        self.assertTrue(tpd.get("item_url_patterns"))

    def test_export_includes_new_ready_including_tpd(self):
        ready = {p["source_id"] for p in export_automation_ready_profiles()}
        for sid in (
            "turkmsic_medical_students",
            "ttb_national",
            "hsgm_public_health",
            "klimık_infectious_diseases",
            "trd_radiology",
        ):
            self.assertIn(sid, ready)
        self.assertIn("tpd_psychiatry", ready)

    def test_turkmsic_keyword_gate(self):
        profile = get_source_profile(self.eff, "turkmsic_medical_students")
        ok = classify_item(profile, title="Yaz staj exchange burs fırsatı", body="")
        self.assertEqual(ok.decision, "ACCEPT")
        bad = classify_item(profile, title="Kongre ekip içi geçmiş etkinlik", body="")
        self.assertEqual(bad.decision, "DISCARD")


if __name__ == "__main__":
    unittest.main()
