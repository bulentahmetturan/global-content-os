"""Phase 1 Ingestion Canary — focused fixtures (no live network)."""
from __future__ import annotations

import inspect
import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

from radar.database import Database
from radar.hekimler_hub_bridge import (
    HEKIMLER_CHANNEL_ID,
    HEKIMLER_CONTENT_FAMILY,
    HEKIMLER_EDITORIAL_BRAND,
    InMemoryHubStore,
)
from radar.phase1_ingestion_canary import (
    FEATURE_FLAG,
    PHASE1_CANARY_SOURCE_IDS,
    TransportResult,
    format_operator_status,
    ingestion_enabled,
    ingest_one_source,
    is_due,
    parse_raw_items,
    plan_is_manual_review_excluded,
    profile_is_excluded_from_canary,
    run_phase1_canary,
    runtime_alignment_audit,
    select_phase1_canary_profiles,
    tls_verified_get,
)


def _json_body(items: list[dict]) -> str:
    return json.dumps({"items": items}, ensure_ascii=False)


def _enabled_env(**extra: str):
    env = {FEATURE_FLAG: "true", **extra}
    return mock.patch.dict("os.environ", env, clear=False)


class Phase1CanaryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.db_path = Path(self.tmp.name) / "canary.sqlite"
        self.db = Database(self.db_path)
        self.db.init()
        self.requests: list[str] = []
        self.hub = InMemoryHubStore()

    def tearDown(self):
        try:
            with self.db.connect() as conn:
                conn.execute("PRAGMA optimize")
        except Exception:
            pass
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

    def test_only_six_phase1_sources_eligible(self):
        profiles = select_phase1_canary_profiles()
        ids = [p["source_id"] for p in profiles]
        self.assertEqual(set(ids), set(PHASE1_CANARY_SOURCE_IDS))
        self.assertEqual(len(ids), 6)
        self.assertTrue(profile_is_excluded_from_canary("anadolu_ajansi_medical_radar"))
        self.assertTrue(profile_is_excluded_from_canary("ttb_national"))
        self.assertTrue(profile_is_excluded_from_canary("abroad_us_usmle"))

    def test_excluded_source_makes_no_request(self):
        with _enabled_env():
            summary = run_phase1_canary(
                db=self.db,
                dry_run=False,
                hub_client=self.hub,
                source_id="anadolu_ajansi_medical_radar",
                transport=self._transport({}),
                force_due=True,
            )
        self.assertEqual(summary.results[0].operator_status, "blocked_excluded_source")
        self.assertEqual(self.requests, [])

    def test_feature_flag_off_no_fetch(self):
        with mock.patch.dict("os.environ", {FEATURE_FLAG: "false"}, clear=False):
            self.assertFalse(ingestion_enabled())
            summary = run_phase1_canary(
                db=self.db,
                dry_run=False,
                hub_client=self.hub,
                transport=self._transport(
                    {
                        "osym.gov.tr": TransportResult(
                            200,
                            _json_body([{"title": "TUS", "url": "https://www.osym.gov.tr/a"}]),
                            True,
                            "x",
                        )
                    }
                ),
                force_due=True,
            )
        self.assertFalse(summary.enabled)
        self.assertEqual(summary.results[0].operator_status, "feature_flag_off")
        self.assertEqual(self.requests, [])

    def test_force_due_does_not_bypass_feature_flag(self):
        """--force / --force-due must never enable HTTP when flag is off."""
        with mock.patch.dict("os.environ", {FEATURE_FLAG: "false"}, clear=False):
            summary = run_phase1_canary(
                db=self.db,
                dry_run=True,
                source_id="osym_medical_exams",
                transport=self._transport(
                    {"osym.gov.tr": TransportResult(200, _json_body([]), True, "x")}
                ),
                force_due=True,
            )
        self.assertFalse(summary.enabled)
        self.assertEqual(summary.results[0].operator_status, "feature_flag_off")
        self.assertEqual(self.requests, [])

    def test_due_logic_respects_interval(self):
        profile = {"fetch_plan": {"expected_check_interval_minutes": 360}}
        now = datetime(2026, 9, 19, 12, 0, tzinfo=timezone.utc)
        self.assertTrue(is_due(profile, last_success_at=None, now=now))
        recent = (now - timedelta(minutes=60)).strftime("%Y-%m-%dT%H:%M:%SZ")
        self.assertFalse(is_due(profile, last_success_at=recent, now=now))
        old = (now - timedelta(minutes=400)).strftime("%Y-%m-%dT%H:%M:%SZ")
        self.assertTrue(is_due(profile, last_success_at=old, now=now))

    def test_tls_failure_fail_closed_no_candidate(self):
        def bad_tls(url: str) -> TransportResult:
            self.requests.append(url)
            return TransportResult(None, "", False, url, failure_reason="cert verify failed")

        with _enabled_env():
            summary = run_phase1_canary(
                db=self.db,
                dry_run=False,
                hub_client=self.hub,
                source_id="osym_medical_exams",
                transport=bad_tls,
                force_due=True,
            )
        r = summary.results[0]
        self.assertEqual(r.operator_status, "blocked_by_tls")
        self.assertEqual(r.source_health, "DEGRADED")
        self.assertEqual(len(self.db.list_candidates()), 0)

    def test_force_due_does_not_bypass_tls(self):
        def bad_tls(url: str) -> TransportResult:
            self.requests.append(url)
            return TransportResult(None, "", False, url, failure_reason="cert verify failed")

        with _enabled_env():
            summary = run_phase1_canary(
                db=self.db,
                dry_run=True,
                source_id="osym_medical_exams",
                transport=bad_tls,
                force_due=True,
            )
        self.assertEqual(summary.results[0].operator_status, "blocked_by_tls")
        self.assertEqual(len(self.db.list_candidates()), 0)

    def test_force_due_does_not_bypass_hostname_allowlist(self):
        profile = {
            "source_id": "osym_medical_exams",
            "source_url": "https://evil.example/attack",
            "primary_url": "https://evil.example/attack",
            "fetch_plan": {
                "source_health": "HEALTHY",
                "allowed_hostnames": ["www.osym.gov.tr"],
                "allowed_path_patterns": ["/"],
                "surfaces": [{"role": "primary", "url": "https://evil.example/attack", "health": "HEALTHY"}],
            },
        }
        with _enabled_env():
            result = ingest_one_source(
                profile,
                db=self.db,
                dry_run=True,
                transport=self._transport({}),
                force_due=True,
            )
        self.assertEqual(result.operator_status, "blocked_by_allowlist")
        self.assertEqual(self.requests, [])

    def test_force_due_does_not_bypass_path_allowlist(self):
        profile = {
            "source_id": "osym_medical_exams",
            "source_url": "https://www.osym.gov.tr/forbidden-path",
            "primary_url": "https://www.osym.gov.tr/forbidden-path",
            "fetch_plan": {
                "source_health": "HEALTHY",
                "allowed_hostnames": ["www.osym.gov.tr"],
                "allowed_path_patterns": ["/SinavGrubu/"],
                "surfaces": [
                    {
                        "role": "primary",
                        "url": "https://www.osym.gov.tr/forbidden-path",
                        "health": "HEALTHY",
                    }
                ],
            },
        }
        with _enabled_env():
            result = ingest_one_source(
                profile,
                db=self.db,
                dry_run=True,
                transport=self._transport({}),
                force_due=True,
            )
        self.assertEqual(result.operator_status, "blocked_by_allowlist")
        self.assertEqual(self.requests, [])

    def test_force_due_does_not_bypass_medical_scope_gate(self):
        body = _json_body(
            [{"title": "2026 KPSS Lisans Başvuru Duyurusu", "url": "https://www.osym.gov.tr/kpss"}]
        )
        with _enabled_env():
            summary = run_phase1_canary(
                db=self.db,
                dry_run=False,
                hub_client=self.hub,
                source_id="osym_medical_exams",
                transport=self._transport({"osym.gov.tr": TransportResult(200, body, True, "x")}),
                force_due=True,
            )
        self.assertEqual(summary.results[0].discarded_count, 1)
        self.assertEqual(summary.results[0].accepted_count, 0)
        self.assertEqual(len(self.db.list_candidates()), 0)

    def test_force_due_does_not_bypass_manual_review_exclusion(self):
        self.assertTrue(
            plan_is_manual_review_excluded(
                {"source_health": "MANUAL_REVIEW_REQUIRED", "surfaces": []}
            )
        )
        profile = {
            "source_id": "osym_medical_exams",
            "source_url": "https://www.osym.gov.tr/",
            "fetch_plan": {
                "source_health": "MANUAL_REVIEW_REQUIRED",
                "allowed_hostnames": ["www.osym.gov.tr"],
                "allowed_path_patterns": ["/"],
                "surfaces": [
                    {
                        "role": "primary",
                        "url": "https://www.osym.gov.tr/",
                        "health": "MANUAL_REVIEW_REQUIRED",
                    }
                ],
            },
        }
        with _enabled_env():
            result = ingest_one_source(
                profile,
                db=self.db,
                dry_run=True,
                transport=self._transport({}),
                force_due=True,
            )
        self.assertEqual(result.operator_status, "blocked_manual_review")
        self.assertEqual(self.requests, [])

    def test_fetch_failure_degraded_no_candidate(self):
        with _enabled_env():
            summary = run_phase1_canary(
                db=self.db,
                dry_run=False,
                hub_client=self.hub,
                source_id="yok_medical_education",
                transport=self._transport(
                    {
                        "yok.gov.tr": TransportResult(
                            503, "", True, "https://www.yok.gov.tr/tr/announcements", "HTTP 503"
                        )
                    }
                ),
                force_due=True,
            )
        r = summary.results[0]
        self.assertEqual(r.operator_status, "degraded")
        self.assertEqual(r.source_health, "DEGRADED")
        self.assertEqual(len(self.db.list_candidates()), 0)

    def test_tus_reaches_needs_review(self):
        body = _json_body(
            [
                {
                    "title": "2026 TUS 1. Dönem Başvuru Tarihleri Açıklandı",
                    "url": "https://www.osym.gov.tr/2026-tus-fixture-tus-2026-announcement",
                    "published_at": "2026-09-01",
                }
            ]
        )
        with _enabled_env():
            summary = run_phase1_canary(
                db=self.db,
                dry_run=False,
                hub_client=self.hub,
                source_id="osym_medical_exams",
                transport=self._transport(
                    {
                        "osym.gov.tr": TransportResult(
                            200, body, True, "https://www.osym.gov.tr/SinavGrubu/Index/6"
                        )
                    }
                ),
                force_due=True,
            )
        r = summary.results[0]
        self.assertEqual(r.accepted_count, 1)
        self.assertEqual(len(self.db.list_candidates()), 0)  # Hub is SoT; local not silently used
        hub_rows = self.hub.review_query(
            channel_id=HEKIMLER_CHANNEL_ID,
            content_family=HEKIMLER_CONTENT_FAMILY,
        )
        self.assertEqual(len(hub_rows), 1)
        self.assertEqual(hub_rows[0].editorial_brand, HEKIMLER_EDITORIAL_BRAND)
        self.assertEqual(hub_rows[0].channel_id, HEKIMLER_CHANNEL_ID)
        meta = hub_rows[0].intake_meta
        self.assertEqual(meta["decision"], "NEEDS_REVIEW")
        self.assertFalse(meta["auto_publish"])
        self.assertIn("primaryUrl", meta)
        self.assertIn("provenance", meta)

    def test_kpss_discarded(self):
        body = _json_body(
            [{"title": "2026 KPSS Lisans Başvuru Duyurusu", "url": "https://www.osym.gov.tr/kpss"}]
        )
        with _enabled_env():
            summary = run_phase1_canary(
                db=self.db,
                dry_run=False,
                hub_client=self.hub,
                source_id="osym_medical_exams",
                transport=self._transport({"osym.gov.tr": TransportResult(200, body, True, "x")}),
                force_due=True,
            )
        self.assertEqual(summary.results[0].discarded_count, 1)
        self.assertEqual(summary.results[0].accepted_count, 0)
        self.assertEqual(len(self.db.list_candidates()), 0)

    def test_unrelated_yok_discarded(self):
        body = _json_body(
            [{"title": "Hukuk Fakültesi Kontenjanları Artırıldı", "url": "https://www.yok.gov.tr/x"}]
        )
        with _enabled_env():
            summary = run_phase1_canary(
                db=self.db,
                dry_run=False,
                hub_client=self.hub,
                source_id="yok_medical_education",
                transport=self._transport({"yok.gov.tr": TransportResult(200, body, True, "x")}),
                force_due=True,
            )
        self.assertEqual(summary.results[0].discarded_count, 1)
        self.assertEqual(len(self.db.list_candidates()), 0)

    def test_tuk_resmi_yokak_medical_reach_review(self):
        cases = [
            (
                "tuk_specialty_training",
                "tuk.saglik.gov.tr",
                "TUK Kararı: Uzmanlık Eğitimi Rotasyonları Güncellendi",
                "https://tuk.saglik.gov.tr/a",
            ),
            (
                "resmi_gazete_medical_regulation",
                "resmigazete.gov.tr",
                "Tıpta ve Diş Hekimliğinde Uzmanlık Eğitimi Yönetmeliğinde Değişiklik",
                "https://www.resmigazete.gov.tr/eskiler/2026/09/a.htm",
            ),
            (
                "yokak_medical_accreditation",
                "yokak.gov.tr",
                "Tıp Programı Akreditasyon Standartları Güncellendi",
                "https://www.yokak.gov.tr/a",
            ),
        ]
        for source_id, host, title, url in cases:
            with self.subTest(source_id=source_id):
                self.requests.clear()
                body = _json_body([{"title": title, "url": url}])
                with _enabled_env():
                    summary = run_phase1_canary(
                        db=self.db,
                        dry_run=False,
                hub_client=self.hub,
                        source_id=source_id,
                        transport=self._transport({host: TransportResult(200, body, True, url)}),
                        force_due=True,
                    )
                self.assertGreaterEqual(summary.results[0].accepted_count, 1, summary.results[0])
                self.assertGreaterEqual(len(self.hub.items), 1)

    def test_tuik_registry_plan_is_manual_review_blocked(self):
        """A MANUAL_REVIEW_REQUIRED registry source (ECFMG, 403 bot protection) must never be fetched."""
        with _enabled_env():
            summary = run_phase1_canary(
                db=self.db,
                dry_run=True,
                source_id="abroad_us_ecfmg_intealth",
                transport=self._transport({}),
                force_due=True,
            )
        self.assertIn(summary.results[0].operator_status, {"blocked_manual_review", "blocked_excluded_source"})
        self.assertEqual(self.requests, [])

    def test_tuik_medical_scope_passes_when_plan_healthy(self):
        """Medical gate (not registry health): health stats accept; inflation discard."""
        profile = {
            "source_id": "tuik_medical_public_health",
            "source_url": "https://data.tuik.gov.tr/",
            "primary_url": "https://data.tuik.gov.tr/",
            "institution": "TÜİK",
            "include_keywords": ["ölüm neden", "ölüm istatistik", "sağlık istatistik"],
            "exclude_keywords": ["enflasyon", "TÜFE", "turizm"],
            "default_route_on_accept": "DATA_INSIGHT",
            "fetch_plan": {
                "source_health": "HEALTHY",
                "primary_method": "list-page",
                "allowed_hostnames": ["data.tuik.gov.tr", "tuik.gov.tr"],
                "allowed_path_patterns": ["/"],
                "surfaces": [
                    {
                        "role": "primary",
                        "url": "https://data.tuik.gov.tr/",
                        "health": "HEALTHY",
                    }
                ],
            },
            "audience_segments": ["physician"],
            "risk_flags": [],
        }
        medical = _json_body(
            [
                {
                    "title": "Ölüm ve Ölüm Nedeni İstatistikleri, 2024",
                    "url": "https://data.tuik.gov.tr/bulten/1",
                }
            ]
        )
        inflation = _json_body(
            [
                {
                    "title": "Tüketici Fiyat Endeksi (TÜFE) / Enflasyon, Ağustos 2026",
                    "url": "https://data.tuik.gov.tr/bulten/2",
                }
            ]
        )
        with _enabled_env():
            ok = ingest_one_source(
                profile,
                db=self.db,
                dry_run=True,
                transport=self._transport(
                    {"data.tuik.gov.tr": TransportResult(200, medical, True, "x")}
                ),
                force_due=True,
            )
            self.requests.clear()
            bad = ingest_one_source(
                profile,
                db=self.db,
                dry_run=True,
                transport=self._transport(
                    {"data.tuik.gov.tr": TransportResult(200, inflation, True, "x")}
                ),
                force_due=True,
            )
        self.assertGreaterEqual(ok.accepted_count, 1, ok)
        self.assertEqual(bad.discarded_count, 1)
        self.assertEqual(bad.accepted_count, 0)

    def test_duplicate_second_run_no_second_candidate(self):
        body = _json_body(
            [
                {
                    "title": "2026 TUS 1. Dönem Başvuru Tarihleri Açıklandı",
                    "url": "https://www.osym.gov.tr/2026-tus-fixture-tus-dup-announcement",
                }
            ]
        )
        transport = self._transport({"osym.gov.tr": TransportResult(200, body, True, "x")})
        with _enabled_env():
            run_phase1_canary(
                db=self.db,
                dry_run=False,
                hub_client=self.hub,
                source_id="osym_medical_exams",
                transport=transport,
                force_due=True,
            )
            summary2 = run_phase1_canary(
                db=self.db,
                dry_run=False,
                hub_client=self.hub,
                source_id="osym_medical_exams",
                transport=transport,
                force_due=True,
            )
        self.assertEqual(len(self.hub.items), 1)
        self.assertEqual(summary2.results[0].duplicate_count, 1)
        self.assertEqual(len(self.db.list_candidates()), 0)

    def test_dry_run_creates_no_persistent_candidate(self):
        body = _json_body(
            [
                {
                    "title": "2026 TUS 1. Dönem Başvuru Tarihleri Açıklandı",
                    "url": "https://www.osym.gov.tr/2026-tus-fixture-tus-dry-announcement",
                }
            ]
        )
        with _enabled_env():
            summary = run_phase1_canary(
                db=self.db,
                dry_run=True,
                source_id="osym_medical_exams",
                transport=self._transport({"osym.gov.tr": TransportResult(200, body, True, "x")}),
                force_due=True,
            )
        self.assertEqual(summary.results[0].accepted_count, 1)
        self.assertEqual(len(self.db.list_candidates()), 0)

    def test_commit_never_approves_renders_or_publishes(self):
        body = _json_body(
            [
                {
                    "title": "2026 TUS 1. Dönem Başvuru Tarihleri Açıklandı",
                    "url": "https://www.osym.gov.tr/2026-tus-fixture-tus-pub-announcement",
                }
            ]
        )
        with _enabled_env():
            with mock.patch("radar.database.Database.set_status") as set_status:
                run_phase1_canary(
                    db=self.db,
                    dry_run=False,
                hub_client=self.hub,
                    source_id="osym_medical_exams",
                    transport=self._transport(
                        {"osym.gov.tr": TransportResult(200, body, True, "x")}
                    ),
                    force_due=True,
                )
                set_status.assert_not_called()
        self.assertEqual(len(self.db.list_candidates()), 0)
        hub_rows = list(self.hub.items.values())
        self.assertEqual(len(hub_rows), 1)
        self.assertEqual(hub_rows[0].triage_status, "inbox")
        self.assertNotEqual(hub_rows[0].triage_status, "approved")
        meta = hub_rows[0].intake_meta
        self.assertFalse(meta.get("auto_publish"))
        self.assertFalse(meta.get("publication_eligible"))

    def test_tls_helper_never_disables_verification(self):
        src = inspect.getsource(tls_verified_get)
        self.assertIn("create_default_context", src)
        self.assertNotIn("CERT_NONE", src.replace("create_default_context", ""))
        self.assertNotIn("_create_unverified_context", src)
        self.assertNotIn("check_hostname = False", src)

    def test_operator_status_readable(self):
        with mock.patch.dict("os.environ", {FEATURE_FLAG: "false"}, clear=False):
            summary = run_phase1_canary(db=self.db, dry_run=True)
        text = format_operator_status(summary)
        self.assertIn("feature_flag_off", text)

    def test_runtime_alignment_audit_hub_bridge_ready(self):
        audit = runtime_alignment_audit()
        self.assertEqual(audit["verdict"], "HUB_BRIDGE_READY")
        self.assertFalse(audit["live_http_allowed"])
        self.assertEqual(audit["canonical_store"]["assessment"], "aligned")
        self.assertTrue(audit["channel_identity"]["editorial_brand_in_table_column"])
        self.assertTrue(audit["channel_identity"]["content_family_in_table_column"])
        self.assertEqual(len(audit["live_eligible_sources"]), 5)
        self.assertTrue(audit["separation_from_tip_student_candidates"]["without_raw_analysis_only"])

    def test_parse_html_anchors(self):
        html = '<html><a href="/a">2026 TUS Başvuru Duyurusu Uzun Başlık</a></html>'
        items = parse_raw_items(
            source_id="osym_medical_exams",
            source_url="https://www.osym.gov.tr/",
            body=html,
            fetch_method="list-page",
            fetched_at="2026-09-19T00:00:00Z",
        )
        self.assertEqual(len(items), 1)
        self.assertTrue(items[0].canonical_item_url.startswith("https://www.osym.gov.tr/"))


if __name__ == "__main__":
    unittest.main()
