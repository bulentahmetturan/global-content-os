"""Scheduler script: source selection, report rendering, failure isolation."""
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import hekimler_scheduled_run as sched  # noqa: E402


class SchedulerTests(unittest.TestCase):
    def test_all_python_selects_only_python_runner_sources(self):
        ids = sched.select_sources("all-python")
        self.assertIn("abroad_it_salute_foreign_qual", ids)
        self.assertIn("moh_physician_workforce", ids)  # every ready source now runs through the Python path
        self.assertNotIn("abroad_uk_gmc", ids)  # 2026-09-24: disabled, 0 accepted / 40 discarded (S49)
        # 2026-09-24 (S51): disabled, regularly produced content but none of it was scholarship/
        # education (exam-admin logistics / local registration admin only).
        self.assertNotIn("abroad_ie_medical_council", ids)
        self.assertNotIn("abroad_us_usmle", ids)
        self.assertNotIn("abroad_us_nrmp", ids)
        self.assertNotIn("abroad_uk_oriel", ids)
        self.assertNotIn("abroad_au_amc", ids)
        self.assertNotIn("hsgm_public_health", ids)  # runner_region=TR: needs a Türkiye-based runner
        self.assertIn("tdb_dental", ids)

    def test_explicit_selection_ignores_unknown_and_manual_sources(self):
        # abroad_uk_oriel disabled 2026-09-24 (S51); abroad_ca_mcc_img_pathways is still ready.
        ids = sched.select_sources("abroad_us_ecfmg_intealth,abroad_ca_mcc_img_pathways,nope")
        self.assertEqual(ids, ["abroad_ca_mcc_img_pathways"])

    def test_tr_runner_selection(self):
        self.assertEqual(sched.select_sources("tr-runner"), ["hsgm_public_health"])
        self.assertNotIn("hsgm_public_health", sched.select_sources("all"))

    def test_one_failing_source_does_not_stop_the_batch_and_is_reported(self):
        def fake_once(sid, timeout, dry_run):
            if sid == "bad":
                return None, "source timeout after 5s"
            return {"results": [{"operator_status": "candidates_emitted", "fetch_result": "ok", "item_count": 3, "accepted_count": 1,
                                 "duplicate_count": 0, "hub_delivery_failures": 0}], "seconds": 1}, ""

        with mock.patch.object(sched, "run_once", side_effect=fake_once), mock.patch.object(sched.time, "sleep"):
            good = sched.run_source("good", 5, 1, True)
            bad = sched.run_source("bad", 5, 1, True)
        self.assertTrue(good["ok"])
        self.assertFalse(bad["ok"])
        self.assertEqual(bad["attempts"], 2)  # bounded retry on transient timeout
        md = sched.markdown([good, bad])
        self.assertIn("`good`", md)
        self.assertIn("NO", md)

    def test_report_never_contains_the_token(self):
        with mock.patch.dict("os.environ", {"TIP_RADAR_INGEST_TOKEN": "s3cr3t-token-value"}):
            row = {"source_id": "x", "operator_status": "ok", "ok": True, "error": ""}
            self.assertNotIn("s3cr3t-token-value", sched.markdown([row]))


if __name__ == "__main__":
    unittest.main()


class ExitStatusTests(unittest.TestCase):
    def _run(self, results):
        import tempfile
        from unittest import mock

        def fake(sid, timeout, retries, dry_run):
            return {"source_id": sid, "ok": results[sid], "attempts": 1, "operator_status": "x", "parsed": 1}

        with tempfile.TemporaryDirectory() as d, mock.patch.object(sched, "run_source", side_effect=fake),                 mock.patch.object(sched, "select_sources", return_value=list(results)),                 mock.patch("sys.argv", ["x", "--dry-run", "--report-dir", d]):
            return sched.main()

    def test_all_ok_is_zero(self):
        self.assertEqual(self._run({"a": True, "b": True}), 0)

    def test_partial_failure_is_nonzero(self):
        self.assertEqual(self._run({"a": True, "b": False}), 1)

    def test_all_failed_is_nonzero(self):
        self.assertEqual(self._run({"a": False, "b": False}), 1)


class QuotaTests(unittest.TestCase):
    def test_quota_text_is_recognised(self):
        q = "HTTP 500: D1_ERROR: Your account has exceeded D1's free tier daily row write limit."
        self.assertTrue(sched.is_quota_error(q))
        self.assertTrue(sched.is_quota_error("D1_QUOTA_EXCEEDED"))
        self.assertFalse(sched.is_quota_error("HTTP 502 bad gateway"))

    def test_quota_source_is_not_retried_and_marks_row(self):
        from unittest import mock

        calls = []

        def fake_once(sid, timeout, dry_run):
            calls.append(sid)
            return {"results": [{"operator_status": "hub_failed", "fetch_result": "ok", "hub_delivery_failures": 3,
                                 "error_reason": "HTTP 500: D1_ERROR: exceeded D1's free tier daily row write limit"}]}, ""

        with mock.patch.object(sched, "run_once", side_effect=fake_once), mock.patch("time.sleep"):
            row = sched.run_source("x", 10, 3, False)
        self.assertEqual(len(calls), 1)
        self.assertTrue(row["d1_quota"])
        self.assertFalse(row["ok"])
        self.assertTrue(row["error"].startswith("D1_QUOTA_EXCEEDED"))
        self.assertIn("D1 DAILY WRITE QUOTA EXCEEDED", sched.quota_banner([row]))
