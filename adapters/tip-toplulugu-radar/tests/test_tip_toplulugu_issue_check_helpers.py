"""Issue-check helpers that must stay truthful as the calendar and the Hub source list move (no Hub call)."""
import sys
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import tip_toplulugu_issue_check as ic  # noqa: E402


class FutureDatedTests(unittest.TestCase):
    ITEMS = [
        {"id": "a", "publishedAt": "2026-10-01"},
        {"id": "b", "publishedAt": "2026-10-15"},
        {"id": "c", "publishedAt": "2026-09-30"},
        {"id": "d", "publishedAt": "Fri, 25 Sep 2026 06:51:00 GMT"},
        {"id": "e", "publishedAt": None},
    ]

    def ids(self, today):
        return [i["id"] for i in ic.future_dated(self.ITEMS, today)]

    def test_relative_to_today(self):
        self.assertEqual(self.ids(date(2026, 9, 30)), ["a", "b"])
        # With the old "2026-09-30" literal, "a" stayed flagged after 2026-10-01 had arrived.
        self.assertEqual(self.ids(date(2026, 10, 1)), ["b"])
        self.assertEqual(self.ids(date(2026, 10, 15)), [])

    def test_defaults_to_the_current_utc_date(self):
        self.assertEqual(ic.future_dated([{"publishedAt": "2099-01-01"}]), [{"publishedAt": "2099-01-01"}])


class HubScheduledSourcesTests(unittest.TestCase):
    def test_only_sources_the_ready_bundle_schedules(self):
        src = [
            {"sourceId": "a", "schedulerPath": "python_runner_github_actions"},
            {"sourceId": "b", "schedulerPath": "cloudflare_continuous_tick"},
            {"sourceId": "c", "schedulerPath": "none"},  # coverage-override / manual-intake entry
            {"sourceId": "d"},
        ]
        self.assertEqual([s["sourceId"] for s in ic.hub_scheduled_sources(src)], ["a", "b"])


if __name__ == "__main__":
    unittest.main()
