"""Hekimler Hub Ingestion Bridge v1 — unit tests (no live Hub HTTP)."""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest import mock

from radar.database import Database
from radar.hekimler_hub_bridge import (
    HEKIMLER_CHANNEL_ID,
    HEKIMLER_CONTENT_FAMILY,
    HEKIMLER_EDITORIAL_BRAND,
    PHASE1_LIVE_ELIGIBLE_SOURCE_IDS,
    HubCandidatePayload,
    InMemoryHubStore,
    build_hekimler_hub_payload,
    deliver_hekimler_candidate,
)
from radar.phase1_ingestion_canary import (
    FEATURE_FLAG,
    TransportResult,
    run_phase1_canary,
)


def _json_body(items: list[dict]) -> str:
    import json

    from datetime import date

    # Undated items are discarded by policy (2026-09-21); fixtures carry a fresh date.
    today = date.today().isoformat()
    items = [{"published_at": today, **it} for it in items]
    return json.dumps({"items": items}, ensure_ascii=False)


class HekimlerHubBridgeTests(unittest.TestCase):
    def setUp(self):
        self.hub = InMemoryHubStore()
        self.tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.db = Database(Path(self.tmp.name) / "bridge.sqlite")
        self.db.init()
        self.requests: list[str] = []

    def tearDown(self):
        self.db = None
        self.tmp.cleanup()

    def _transport(self, mapping: dict[str, TransportResult]):
        def _fn(url: str) -> TransportResult:
            self.requests.append(url)
            for key, result in mapping.items():
                if key in url:
                    return result
            return TransportResult(404, "", True, url, failure_reason="not mapped")

        return _fn

    def test_live_scope_is_five_sources_tuik_excluded(self):
        self.assertEqual(len(PHASE1_LIVE_ELIGIBLE_SOURCE_IDS), 5)
        self.assertNotIn("tuik_medical_public_health", PHASE1_LIVE_ELIGIBLE_SOURCE_IDS)

    def test_missing_channel_id_rejects(self):
        payload = HubCandidatePayload(
            external_id="x",
            title="TUS",
            summary="TUS",
            url="https://www.osym.gov.tr/a",
            source_id="osym_medical_exams",
            content_hash="abc",
            channel_id="",
        )
        result = deliver_hekimler_candidate(payload, self.hub)
        self.assertFalse(result.delivered)
        self.assertEqual(result.delivery_status, "failed")
        self.assertIn("channel_id", result.error or "")
        self.assertEqual(len(self.hub.items), 0)

    def test_invalid_channel_id_rejects(self):
        payload = build_hekimler_hub_payload(
            source_id="osym_medical_exams",
            title="TUS",
            summary="TUS",
            source_url="https://www.osym.gov.tr/a",
            primary_url="https://www.osym.gov.tr/a",
            content_hash="abc",
            decision="NEEDS_REVIEW",
            decision_route="NEEDS_REVIEW",
            evidence_status="verified",
            audience_segments=["physician"],
            routing_reason="test",
            risk_flags=[],
            provenance={},
            fetched_at="2026-09-19T00:00:00Z",
        )
        payload.channel_id = "tip-ogrencileri-platformu"
        result = deliver_hekimler_candidate(payload, self.hub)
        self.assertFalse(result.delivered)
        self.assertEqual(len(self.hub.items), 0)

    def test_hub_receives_queryable_partition_fields(self):
        payload = build_hekimler_hub_payload(
            source_id="osym_medical_exams",
            title="2026 TUS 1. Dönem Başvuru",
            summary="TUS",
            source_url="https://www.osym.gov.tr/a",
            primary_url="https://www.osym.gov.tr/a",
            content_hash="hash-tus-1",
            decision="NEEDS_REVIEW",
            decision_route="NEEDS_REVIEW",
            evidence_status="verified",
            audience_segments=["resident"],
            routing_reason="include",
            risk_flags=["hekimler_phase1_canary"],
            provenance={"source_id": "osym_medical_exams"},
            fetched_at="2026-09-19T00:00:00Z",
        )
        result = deliver_hekimler_candidate(payload, self.hub)
        self.assertTrue(result.delivered)
        rows = self.hub.review_query(
            channel_id=HEKIMLER_CHANNEL_ID,
            editorial_brand=HEKIMLER_EDITORIAL_BRAND,
            content_family=HEKIMLER_CONTENT_FAMILY,
        )
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].channel_id, HEKIMLER_CHANNEL_ID)
        self.assertEqual(rows[0].editorial_brand, HEKIMLER_EDITORIAL_BRAND)
        self.assertEqual(rows[0].content_family, HEKIMLER_CONTENT_FAMILY)
        self.assertEqual(rows[0].source_id, "osym_medical_exams")

    def test_hekimler_query_excludes_tip_student(self):
        self.hub.seed_tip_student(title="Dönem 3 Ders Kurulu Duyurusu")
        payload = build_hekimler_hub_payload(
            source_id="yok_medical_education",
            title="Tıp Fakültesi Kontenjanları",
            summary="tıp",
            source_url="https://www.yok.gov.tr/a",
            primary_url="https://www.yok.gov.tr/a",
            content_hash="hash-yok-1",
            decision="NEEDS_REVIEW",
            decision_route="PROFESSIONAL_BRIEF",
            evidence_status="verified",
            audience_segments=[],
            routing_reason="include",
            risk_flags=[],
            provenance={},
            fetched_at="2026-09-19T00:00:00Z",
        )
        deliver_hekimler_candidate(payload, self.hub)
        hekimler = self.hub.review_query(
            channel_id=HEKIMLER_CHANNEL_ID,
            content_family=HEKIMLER_CONTENT_FAMILY,
        )
        tip = self.hub.review_query(channel_id="tip-ogrencileri-platformu")
        self.assertEqual(len(hekimler), 1)
        self.assertEqual(len(tip), 1)
        self.assertNotEqual(hekimler[0].id, tip[0].id)
        # Tip legacy remains null family/brand
        self.assertIsNone(tip[0].editorial_brand)
        self.assertIsNone(tip[0].content_family)

    def test_idempotent_retry_no_duplicate(self):
        payload = build_hekimler_hub_payload(
            source_id="osym_medical_exams",
            title="TUS",
            summary="TUS",
            source_url="https://www.osym.gov.tr/a",
            primary_url="https://www.osym.gov.tr/a",
            content_hash="same-hash",
            decision="NEEDS_REVIEW",
            decision_route="NEEDS_REVIEW",
            evidence_status="verified",
            audience_segments=[],
            routing_reason="x",
            risk_flags=[],
            provenance={},
            fetched_at="2026-09-19T00:00:00Z",
        )
        r1 = deliver_hekimler_candidate(payload, self.hub)
        r2 = deliver_hekimler_candidate(payload, self.hub)
        self.assertTrue(r1.created)
        self.assertTrue(r2.duplicate)
        self.assertEqual(len(self.hub.items), 1)

    def test_delivery_failure_not_marked_success(self):
        self.hub.fail_next = True
        payload = build_hekimler_hub_payload(
            source_id="osym_medical_exams",
            title="TUS",
            summary="TUS",
            source_url="https://www.osym.gov.tr/a",
            primary_url="https://www.osym.gov.tr/a",
            content_hash="fail-hash",
            decision="NEEDS_REVIEW",
            decision_route="NEEDS_REVIEW",
            evidence_status="verified",
            audience_segments=[],
            routing_reason="x",
            risk_flags=[],
            provenance={},
            fetched_at="2026-09-19T00:00:00Z",
        )
        result = deliver_hekimler_candidate(payload, self.hub)
        self.assertFalse(result.ok)
        self.assertFalse(result.delivered)
        self.assertEqual(result.delivery_status, "failed")
        self.assertEqual(len(self.hub.items), 0)

    def test_dry_run_creates_no_hub_candidate(self):
        body = _json_body(
            [
                {
                    "title": "2026 TUS 1. Dönem Başvuru Tarihleri Açıklandı",
                    "url": "https://www.osym.gov.tr/2026-tus-fixture-tus-bridge-dry-announcement",
                }
            ]
        )
        with mock.patch.dict("os.environ", {FEATURE_FLAG: "true"}, clear=False):
            summary = run_phase1_canary(
                db=self.db,
                dry_run=True,
                source_id="osym_medical_exams",
                transport=self._transport(
                    {"osym.gov.tr": TransportResult(200, body, True, "x")}
                ),
                force_due=True,
                hub_client=self.hub,
            )
        self.assertEqual(summary.results[0].accepted_count, 1)
        self.assertEqual(len(self.hub.items), 0)
        self.assertEqual(len(self.db.list_candidates()), 0)

    def test_commit_without_hub_client_refuses_local_as_hub(self):
        with mock.patch.dict("os.environ", {FEATURE_FLAG: "true"}, clear=False):
            summary = run_phase1_canary(
                db=self.db,
                dry_run=False,
                source_id="osym_medical_exams",
                transport=self._transport({}),
                force_due=True,
                hub_client=None,
                persist_local=False,
            )
        self.assertEqual(summary.results[0].operator_status, "hub_client_required")
        self.assertEqual(len(self.db.list_candidates()), 0)

    def test_tuik_and_excluded_create_no_hub_candidate(self):
        with mock.patch.dict("os.environ", {FEATURE_FLAG: "true"}, clear=False):
            tuik = run_phase1_canary(
                db=self.db,
                dry_run=False,
                source_id="abroad_uk_gmc",
                transport=self._transport({}),
                force_due=True,
                hub_client=self.hub,
            )
            aa = run_phase1_canary(
                db=self.db,
                dry_run=False,
                source_id="abroad_it_salute_foreign_qual",
                transport=self._transport({}),
                force_due=True,
                hub_client=self.hub,
            )
        self.assertEqual(tuik.results[0].operator_status, "blocked_excluded_source")
        self.assertEqual(aa.results[0].operator_status, "blocked_excluded_source")
        self.assertEqual(self.requests, [])
        self.assertEqual(len(self.hub.items), 0)

    def test_canary_commit_delivers_to_hub_not_local(self):
        body = _json_body(
            [
                {
                    "title": "2026 TUS 1. Dönem Başvuru Tarihleri Açıklandı",
                    "url": "https://www.osym.gov.tr/2026-tus-fixture-tus-hub-announcement",
                }
            ]
        )
        with mock.patch.dict("os.environ", {FEATURE_FLAG: "true"}, clear=False):
            summary = run_phase1_canary(
                db=self.db,
                dry_run=False,
                source_id="osym_medical_exams",
                transport=self._transport(
                    {"osym.gov.tr": TransportResult(200, body, True, "x")}
                ),
                force_due=True,
                hub_client=self.hub,
                persist_local=False,
            )
        self.assertEqual(summary.results[0].accepted_count, 1)
        self.assertEqual(summary.commit_target, "hub")
        self.assertEqual(len(self.db.list_candidates()), 0)
        rows = self.hub.review_query(channel_id=HEKIMLER_CHANNEL_ID)
        self.assertEqual(len(rows), 1)

    def test_no_approve_publish_scheduler_paths_in_bridge_module(self):
        import inspect

        import radar.hekimler_hub_bridge as bridge

        src = inspect.getsource(bridge)
        self.assertNotIn("auto_publish=True", src)
        self.assertNotIn("scheduler", src.lower().replace("scheduled_fetch", ""))
        self.assertNotIn("set_status", src)
        self.assertNotIn("approve", src)


if __name__ == "__main__":
    unittest.main()
