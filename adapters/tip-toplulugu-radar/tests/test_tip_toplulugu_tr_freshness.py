import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import tip_toplulugu_tr_freshness as f  # noqa: E402

NOW = datetime(2026, 9, 21, 12, 0, tzinfo=timezone.utc)


def row(hours_ago, **kw):
    t = (NOW - timedelta(hours=hours_ago)).strftime("%Y-%m-%dT%H:%M:%SZ")
    return {"last_success_at": t, "source_health": "HEALTHY", **kw}


class FreshnessTests(unittest.TestCase):
    def test_fresh_ok(self):
        self.assertEqual(f.evaluate(row(3), NOW, 48), [])

    def test_never_succeeded(self):
        self.assertTrue(f.evaluate(None, NOW, 48))
        self.assertTrue(f.evaluate({"last_success_at": None}, NOW, 48))

    def test_stale(self):
        self.assertIn("last success", f.evaluate(row(72), NOW, 48)[0])

    def test_degraded_and_quota(self):
        p = f.evaluate(row(1, source_health="DEGRADED", failure_count=3, coverage_reason='{"error":"D1_QUOTA_EXCEEDED"}'), NOW, 48)
        self.assertEqual(len(p), 2)


class RunnerGateTests(unittest.TestCase):
    def test_gate_follows_the_tr_runner_switch(self):
        self.assertFalse(f.runner_enabled({}))
        self.assertFalse(f.runner_enabled({"TR_RUNNER_ENABLED": ""}))
        self.assertFalse(f.runner_enabled({"TR_RUNNER_ENABLED": "false"}))
        self.assertTrue(f.runner_enabled({"TR_RUNNER_ENABLED": "true"}))

    def test_without_runner_reports_not_measured_and_does_not_read_the_hub(self):
        import io
        import os
        import tempfile
        from contextlib import redirect_stdout
        from unittest import mock

        with tempfile.TemporaryDirectory() as d:
            summary = os.path.join(d, "summary.md")
            env = {"TR_RUNNER_ENABLED": "", "GITHUB_STEP_SUMMARY": summary}
            with mock.patch.dict("os.environ", env), mock.patch.object(f.urllib.request, "urlopen") as net, \
                    redirect_stdout(io.StringIO()) as out:
                self.assertEqual(f.main([]), 0)
            net.assert_not_called()
            self.assertIn("hsgm_public_health are not collected", out.getvalue())
            with open(summary, encoding="utf-8") as fh:
                self.assertIn("NOT MEASURED", fh.read())

    def test_with_runner_a_stale_source_is_red(self):
        import io
        import json
        from contextlib import redirect_stdout
        from unittest import mock

        body = json.dumps({"sources": [{"sourceId": "hsgm_public_health", "telemetry": None}]}).encode()
        resp = mock.MagicMock()
        resp.__enter__.return_value = io.BytesIO(body)
        with mock.patch.dict("os.environ", {"TR_RUNNER_ENABLED": "true"}), \
                mock.patch.object(f.urllib.request, "urlopen", return_value=resp), redirect_stdout(io.StringIO()):
            self.assertEqual(f.main([]), 1)


if __name__ == "__main__":
    unittest.main()
