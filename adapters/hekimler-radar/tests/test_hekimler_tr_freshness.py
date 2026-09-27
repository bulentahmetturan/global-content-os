import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import hekimler_tr_freshness as f  # noqa: E402

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


if __name__ == "__main__":
    unittest.main()
