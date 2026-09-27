"""Hekimler Continuous Ingestion Fast Activation v1 — tests (no live network)."""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from radar.database import Database
from radar.hekimler_activation import (
    ACTIVATION_AUTOMATION_READY,
    ACTIVATION_BLOCKED,
    ACTIVATION_MANUAL_INTAKE,
    activation_report,
    compute_activation_state,
    select_automation_ready_due,
)
from radar.hekimler_continuous_runner import (
    CONTINUOUS_FEATURE_FLAG,
    export_automation_ready_profiles,
    run_continuous_ingestion,
)
from radar.hekimler_hub_bridge import (
    HEKIMLER_CHANNEL_ID,
    HEKIMLER_CONTENT_FAMILY,
    InMemoryHubStore,
)
from radar.hekimler_integrity import resolve_effective_registry
from radar.phase1_ingestion_canary import FEATURE_FLAG, TransportResult


def _json_body(items: list[dict]) -> str:
    import json

    from datetime import date

    # Undated items are discarded by policy (2026-09-21); fixtures carry a fresh date.
    today = date.today().isoformat()
    items = [{"published_at": today, **it} for it in items]
    return json.dumps({"items": items}, ensure_ascii=False)


class ActivationAndContinuousTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.db = Database(Path(self.tmp.name) / "cont.sqlite")
        self.db.init()
        self.hub = InMemoryHubStore()
        self.requests: list[str] = []
        self.effective = resolve_effective_registry()

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

    def test_five_active_sources_automation_ready(self):
        import json
        from pathlib import Path

        canon = json.loads((Path(__file__).parent / "fixtures" / "hekimler_ready_sources.json").read_text(encoding="utf-8"))
        ready = {p["source_id"] for p in export_automation_ready_profiles(self.effective)}
        self.assertEqual(ready, set(canon["automation_ready"]))

    def test_intervals_respected_without_force_due(self):
        ready = export_automation_ready_profiles(self.effective)
        # Simulate all recently successful → none due
        last = {p["source_id"]: "2099-01-01T00:00:00Z" for p in ready}
        due = select_automation_ready_due(
            self.effective, last_success_by_source=last, force_due=False
        )
        self.assertEqual(due, [])
        due_forced = select_automation_ready_due(
            self.effective, last_success_by_source=last, force_due=True
        )
        self.assertEqual(len(due_forced), len(ready))

    def test_manual_intake_and_blocked_make_no_requests(self):
        with mock.patch.dict(
            "os.environ",
            {CONTINUOUS_FEATURE_FLAG: "true", FEATURE_FLAG: "true"},
            clear=False,
        ):
            summary = run_continuous_ingestion(
                db=self.db,
                dry_run=True,
                force_due=True,
                transport=self._transport({}),
                hub_client=self.hub,
                source_id="abroad_de_make_it_in_germany",
            )
        # Make it in Germany (Radware CAPTCHA) is not AUTOMATION_READY → not selected → no HTTP
        self.assertEqual(summary.due_count, 0)
        self.assertEqual(self.requests, [])
        tuik = next(
            s
            for s in self.effective["sources"]
            if s["source_id"] == "abroad_de_make_it_in_germany"
        )
        self.assertEqual(compute_activation_state(tuik), ACTIVATION_MANUAL_INTAKE)

    def test_new_automation_ready_profile_joins_without_custom_code(self):
        synthetic = {
            "source_id": "synthetic_ready_source",
            "source_tier": "OFFICIAL_PRIMARY",
            "include_keywords": ["tıp"],
            "exclude_keywords": [],
            "fetch_enabled": True,
            "scheduled_fetch_enabled": True,
            "candidate_emission_enabled": True,
            "pipeline_wiring_enabled": True,
            "publication_eligible": False,
            "runtime_activation": "AUTOMATION_READY",
            "fetch_plan": {
                "primary_method": "list-page",
                "tls_verification_required": True,
                "allowed_hostnames": ["example.gov.tr"],
                "allowed_path_patterns": ["/"],
                "expected_check_interval_minutes": 60,
                "source_health": "HEALTHY",
                "surfaces": [{"role": "primary", "url": "https://example.gov.tr/", "health": "HEALTHY"}],
            },
        }
        self.assertEqual(compute_activation_state(synthetic), ACTIVATION_AUTOMATION_READY)
        # Joins due selection via registry metadata alone
        reg = {"sources": [synthetic], "secondary_sources": []}
        due = select_automation_ready_due(reg, force_due=True)
        self.assertEqual([d["source_id"] for d in due], ["synthetic_ready_source"])

    def test_never_infer_ready_from_tier_alone(self):
        bare = {
            "source_id": "ttb_national",
            "source_tier": "PROFESSIONAL_BODY",
            "include_keywords": ["hekim"],
            "fetch_enabled": False,
            "fetch_plan": {"source_health": "MANUAL_REVIEW_REQUIRED", "primary_method": "list-page"},
        }
        self.assertNotEqual(compute_activation_state(bare), ACTIVATION_AUTOMATION_READY)

    def test_hub_partition_and_idempotency_on_commit(self):
        body = _json_body(
            [
                {
                    "title": "2026 TUS 1. Dönem Başvuru Tarihleri Açıklandı",
                    "url": "https://www.osym.gov.tr/2026-tus-fixture-tus-cont-announcement",
                }
            ]
        )
        with mock.patch.dict(
            "os.environ",
            {CONTINUOUS_FEATURE_FLAG: "true", FEATURE_FLAG: "true"},
            clear=False,
        ):
            s1 = run_continuous_ingestion(
                db=self.db,
                dry_run=False,
                force_due=True,
                transport=self._transport(
                    {"osym.gov.tr": TransportResult(200, body, True, "x")}
                ),
                hub_client=self.hub,
                source_id="osym_medical_exams",
            )
            s2 = run_continuous_ingestion(
                db=self.db,
                dry_run=False,
                force_due=True,
                transport=self._transport(
                    {"osym.gov.tr": TransportResult(200, body, True, "x")}
                ),
                hub_client=self.hub,
                source_id="osym_medical_exams",
            )
        self.assertGreaterEqual(s1.results[0].accepted_count, 1)
        self.assertEqual(s2.results[0].duplicate_count, 1)
        rows = self.hub.review_query(
            channel_id=HEKIMLER_CHANNEL_ID, content_family=HEKIMLER_CONTENT_FAMILY
        )
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].triage_status, "inbox")
        self.assertFalse(rows[0].intake_meta.get("auto_publish"))

    def test_delivery_failure_visible(self):
        body = _json_body(
            [
                {
                    "title": "2026 TUS 1. Dönem Başvuru Tarihleri Açıklandı",
                    "url": "https://www.osym.gov.tr/2026-tus-fixture-tus-fail-announcement",
                }
            ]
        )
        self.hub.fail_next = True
        with mock.patch.dict(
            "os.environ",
            {CONTINUOUS_FEATURE_FLAG: "true", FEATURE_FLAG: "true"},
            clear=False,
        ):
            summary = run_continuous_ingestion(
                db=self.db,
                dry_run=False,
                force_due=True,
                transport=self._transport(
                    {"osym.gov.tr": TransportResult(200, body, True, "x")}
                ),
                hub_client=self.hub,
                source_id="osym_medical_exams",
            )
        self.assertEqual(summary.results[0].operator_status, "hub_delivery_failed")
        self.assertEqual(len(self.hub.items), 0)

    def test_dry_run_no_hub_candidate(self):
        body = _json_body(
            [
                {
                    "title": "2026 TUS 1. Dönem Başvuru Tarihleri Açıklandı",
                    "url": "https://www.osym.gov.tr/2026-tus-fixture-tus-dry-c-announcement",
                }
            ]
        )
        with mock.patch.dict(
            "os.environ",
            {CONTINUOUS_FEATURE_FLAG: "true", FEATURE_FLAG: "true"},
            clear=False,
        ):
            summary = run_continuous_ingestion(
                db=self.db,
                dry_run=True,
                force_due=True,
                transport=self._transport(
                    {"osym.gov.tr": TransportResult(200, body, True, "x")}
                ),
                hub_client=self.hub,
                source_id="osym_medical_exams",
            )
        self.assertGreaterEqual(summary.results[0].accepted_count, 1)
        self.assertEqual(len(self.hub.items), 0)

    def test_activation_report_groups_all_sources(self):
        report = activation_report(self.effective)
        self.assertEqual(report["counts"][ACTIVATION_AUTOMATION_READY], len(json.loads((__import__("pathlib").Path(__file__).parent / "fixtures" / "hekimler_ready_sources.json").read_text(encoding="utf-8"))["automation_ready"]))
        self.assertGreaterEqual(report["counts"][ACTIVATION_MANUAL_INTAKE], 1)
        self.assertIn(ACTIVATION_BLOCKED, report["counts"])

    def test_no_publish_path_in_continuous_modules(self):
        import inspect

        import radar.hekimler_continuous_runner as cont
        import radar.hekimler_activation as act

        for mod in (cont, act):
            src = inspect.getsource(mod)
            self.assertNotIn("auto_publish=True", src)
            self.assertNotIn("publication_eligible=True", src)


if __name__ == "__main__":
    unittest.main()
