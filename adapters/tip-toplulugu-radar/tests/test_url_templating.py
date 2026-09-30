from __future__ import annotations

import re
import unittest

from radar.fetchers import resolve_url


class UrlTemplatingTests(unittest.TestCase):
    def test_today_placeholder_replaced_with_iso_date(self):
        resolved = resolve_url("https://www.resmigazete.gov.tr/fihrist?tarih={today}")
        self.assertNotIn("{today}", resolved)
        match = re.search(r"tarih=(\d{4}-\d{2}-\d{2})$", resolved)
        self.assertIsNotNone(match)

    def test_url_without_placeholder_is_unchanged(self):
        url = "https://www.osym.gov.tr/Duyurular/Index"
        self.assertEqual(resolve_url(url), url)


if __name__ == "__main__":
    unittest.main()
