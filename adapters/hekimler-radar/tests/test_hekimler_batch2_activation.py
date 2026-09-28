"""Batch 2 surface activation — MoH (YHGM) / HSGM / PubMed."""
from __future__ import annotations

import unittest

from radar.hekimler_activation import (
    ACTIVATION_AUTOMATION_READY,
    ACTIVATION_MANUAL_INTAKE,
    compute_activation_state,
)
from radar.hekimler_continuous_runner import export_automation_ready_profiles
from radar.hekimler_hub_bridge import (
    HEKIMLER_CHANNEL_ID,
    HEKIMLER_CONTENT_FAMILY,
    HEKIMLER_EDITORIAL_BRAND,
    build_hekimler_hub_payload,
)
from radar.hekimler_integrity import resolve_effective_registry
from radar.hekimler_pubmed_pack import validate_approved_query_pack
from radar.hekimler_registry import classify_item, get_source_profile
from radar.hekimler_research_policy import pubmed_record_complete


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


class Batch2ActivationTests(unittest.TestCase):
    def setUp(self):
        self.eff = resolve_effective_registry()
        self.moh = get_source_profile(self.eff, "moh_physician_workforce")
        self.hsgm = get_source_profile(self.eff, "hsgm_public_health")
        self.pubmed = get_source_profile(self.eff, "pubmed_biomedical_evidence")

    def test_moh_automation_ready_yhgm_only(self):
        self.assertEqual(compute_activation_state(self.moh), ACTIVATION_AUTOMATION_READY)
        self.assertTrue(_host_path_ok(
            self.moh,
            "https://yhgm.saglik.gov.tr/TR,11622/devlet-hizmeti-yukumlulugu-kuralari.html",
        ))
        self.assertFalse(_host_path_ok(self.moh, "https://www.saglik.gov.tr/"))
        self.assertFalse(_host_path_ok(self.moh, "https://saglik.gov.tr/TR/anasayfa"))
        self.assertFalse(_host_path_ok(self.moh, "https://yhgm.saglik.gov.tr/"))

    def test_moh_accepts_dhy_discards_nurse_and_pr(self):
        ok = classify_item(
            self.moh,
            title="131. Dönem Devlet Hizmeti Yükümlülüğü Kurası İlanı",
            body="",
        )
        self.assertEqual(ok.decision, "ACCEPT")
        bad = classify_item(self.moh, title="Ebe Hemşire Atama Daire Başkanlığı", body="")
        self.assertEqual(bad.decision, "DISCARD")
        pr = classify_item(self.moh, title="Hastane açılış basın açıklaması genel", body="")
        self.assertEqual(pr.decision, "DISCARD")

    def test_hsgm_basin_odasi_automation_ready(self):
        self.assertEqual(compute_activation_state(self.hsgm), ACTIVATION_AUTOMATION_READY)
        self.assertTrue(self.hsgm.get("fetch_enabled"))
        plan = self.hsgm.get("fetch_plan") or {}
        paths = plan.get("allowed_path_patterns") or []
        self.assertTrue(any("basin-odasi" in p for p in paths))
        self.assertNotIn("/", paths)
        self.assertTrue(_host_path_ok(
            self.hsgm,
            "https://hsgm.saglik.gov.tr/tr/basin-odasi/basin-odasi-haberler.html",
        ))
        self.assertFalse(_host_path_ok(self.hsgm, "https://hsgm.saglik.gov.tr/tr/"))
        self.assertFalse(_host_path_ok(self.hsgm, "https://hsgm.saglik.gov.tr/tr/mevzuat.html"))

    def test_pubmed_ready_and_rejects_unrestricted(self):
        self.assertEqual(compute_activation_state(self.pubmed), ACTIVATION_AUTOMATION_READY)
        ok, _ = validate_approved_query_pack(self.pubmed["approved_query_pack"])
        self.assertTrue(ok)
        bad, reason = validate_approved_query_pack([{"id": "x", "term": "*"}])
        self.assertFalse(bad)
        self.assertEqual(reason, "unrestricted_query_rejected")

    def test_pubmed_missing_pmid_blocks_research_candidate(self):
        ok, missing = pubmed_record_complete({"title": "Study", "publication_status": "ppublish"})
        self.assertFalse(ok)
        self.assertIn("PMID", missing)

    def test_hub_payload_partition_for_activated(self):
        for sid in ("moh_physician_workforce", "pubmed_biomedical_evidence"):
            payload = build_hekimler_hub_payload(
                source_id=sid,
                title="Test NEEDS_REVIEW item",
                summary="summary",
                source_url="https://example.test/item",
                primary_url="https://example.test/",
                content_hash="abc",
                decision="NEEDS_REVIEW",
                decision_route="NEEDS_REVIEW",
                evidence_status="verified",
                audience_segments=["physician"],
                routing_reason="fixture",
                risk_flags=["editorial_review_mandatory"],
                provenance={"source_id": sid},
                fetched_at="2026-09-19T00:00:00Z",
                created_at="2026-09-19T00:00:00Z",
                institution="test",
            )
            self.assertEqual(payload.channel_id, HEKIMLER_CHANNEL_ID)
            self.assertEqual(payload.editorial_brand, HEKIMLER_EDITORIAL_BRAND)
            self.assertEqual(payload.content_family, HEKIMLER_CONTENT_FAMILY)
            self.assertEqual(payload.decision, "NEEDS_REVIEW")
            self.assertNotIn("APPROVED", payload.decision)

    def test_ready_export_includes_moh_pubmed_hsgm(self):
        ready = {p["source_id"] for p in export_automation_ready_profiles(self.eff)}
        self.assertIn("moh_physician_workforce", ready)
        self.assertIn("pubmed_biomedical_evidence", ready)
        self.assertIn("hsgm_public_health", ready)
        for sid in (
            "osym_medical_exams",
            "yok_medical_education",
            "yokak_medical_accreditation",
            "tuk_specialty_training",
            "resmi_gazete_medical_regulation",
        ):
            self.assertIn(sid, ready)

    def test_no_publish_flags(self):
        for sid in ("moh_physician_workforce", "pubmed_biomedical_evidence", "hsgm_public_health"):
            p = get_source_profile(self.eff, sid)
            self.assertIs(p.get("publication_eligible"), False)


if __name__ == "__main__":
    unittest.main()
