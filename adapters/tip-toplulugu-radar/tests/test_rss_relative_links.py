import unittest

from radar import phase1_ingestion_canary as c

RSS = """<rss version="2.0"><channel>
<item><guid>/news/a</guid><link>/news/measles-outbreak</link><title>Measles Cases Are on the Rise: What to Know</title>
<pubDate>Thu, 24 Sep 2026 20:00:00 Z</pubDate></item>
<item><link>//cdn.example.org/x</link><title>Protocol-relative link is not resolved</title></item>
</channel></rss>"""


class RelativeRssLinkTests(unittest.TestCase):
    def test_root_relative_item_links_resolve_against_feed_url(self):
        rows = c._parse_rss_items(source_id="yale_medicine_news", source_url="https://www.yalemedicine.org/rss/news.xml",
                                  body=RSS, fetched_at="2026-10-01T00:00:00Z", fetch_method="test")
        self.assertEqual([r.canonical_item_url for r in rows], ["https://www.yalemedicine.org/news/measles-outbreak"])
        self.assertEqual(rows[0].published_at, "2026-09-24")


if __name__ == "__main__":
    unittest.main()
