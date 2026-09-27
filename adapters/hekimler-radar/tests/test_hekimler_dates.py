"""D9 date policy fixtures (product rule, not implementation echo)."""
import unittest
from datetime import date

from radar.hekimler_dates import date_verdict, extract_dates, extract_page_date

TODAY = date(2026, 9, 20)


class DatePolicyTests(unittest.TestCase):
    def test_general_window_is_90_days(self):
        v, _ = date_verdict("ttb_national", published_at="2026-07-10", today=TODAY)
        self.assertEqual(v, "FRESH")
        v, _ = date_verdict("ttb_national", published_at="2026-06-01", today=TODAY)
        self.assertEqual(v, "STALE")

    def test_exam_sources_use_180_days(self):
        v, _ = date_verdict("osym_dus_dental_exams", published_at="2026-04-01", today=TODAY)
        self.assertEqual(v, "FRESH")
        v, _ = date_verdict("osym_dus_dental_exams", published_at="2026-02-01", today=TODAY)
        self.assertEqual(v, "STALE")

    def test_future_dated_item_is_active_even_if_published_long_ago(self):
        v, d = date_verdict("ttb_national", published_at=None, title="Duyuru 01.01.2026 son başvuru 30.09.2026", today=TODAY)
        self.assertEqual((v, d), ("ACTIVE", date(2026, 9, 30)))

    def test_undated_is_never_silently_dropped(self):
        v, d = date_verdict("moh_physician_workforce", published_at=None, title="129.Dönem Kura", today=TODAY)
        self.assertEqual((v, d), ("UNDATED", None))

    def test_turkish_and_english_date_formats(self):
        self.assertEqual(extract_dates("17 Eylül 2026 TUS"), [date(2026, 9, 17)])
        self.assertEqual(extract_dates("Updated March 20, 2026"), [date(2026, 3, 20)])
        self.assertEqual(extract_dates("25.09.2026"), [date(2026, 9, 25)])

    def test_page_date_prefers_meta_over_text(self):
        html = '<meta property="article:published_time" content="2026-08-01T10:00:00Z"><body>12 Mart 2020</body>'
        d, m = extract_page_date(html)
        self.assertEqual((d, m), (date(2026, 8, 1), "meta:article:published_time"))

    def test_adjacent_list_date_is_read_but_not_from_the_next_item(self):
        from radar.phase1_ingestion_canary import parse_raw_items

        body = (
            '<li><a href="/haberler/a-1">Birinci haber başlığı</a> <span>16/09/2026</span></li>'
            '<li><a href="/haberler/b-2">İkinci haber başlığı</a></li>'
            '<li><a href="/haberler/c-3">Üçüncü haber başlığı</a> <span>29/08/2026</span></li>'
        )
        items = parse_raw_items(source_id="x", source_url="https://x.org/haberler", body=body, fetch_method="list-page", fetched_at="t")
        got = {i.title: i.published_at for i in items}
        self.assertEqual(got["Birinci haber başlığı"], "2026-09-16")
        self.assertIsNone(got["İkinci haber başlığı"])
        self.assertEqual(got["Üçüncü haber başlığı"], "2026-08-29")

    def test_future_date_in_plain_text_is_not_trusted_but_meta_is(self):
        html_text = "<body><p>Makale metni 12 Mart 2020</p><aside>Sempozyum 18 Ekim 2099</aside></body>"
        d, m = extract_page_date(html_text)
        self.assertEqual((d, m), (date(2020, 3, 12), "text_top"))
        html_meta = '<meta property="article:published_time" content="2099-01-01">'
        d, m = extract_page_date(html_meta)
        self.assertEqual(d, date(2099, 1, 1))

    def test_url_timestamp_slug_gives_a_date(self):
        self.assertEqual(extract_dates("https://x.org/detail/duyuru-202609041409"), [date(2026, 9, 4)])
        self.assertEqual(extract_dates("https://x.org/detail/id-123456789012345"), [])

    def test_tuik_home_slider_parser(self):
        from pathlib import Path
        from radar.phase1_ingestion_canary import parse_raw_items

        body = (Path(__file__).parent / "fixtures" / "parse_tuik_home.html").read_text(encoding="utf-8", errors="replace")
        items = parse_raw_items(source_id="tuik_medical_public_health", source_url="https://www.tuik.gov.tr/", body=body, fetch_method="list-page", fetched_at="t")
        self.assertGreaterEqual(len(items), 4)
        self.assertTrue(all("veriportali.tuik.gov.tr/tr/press/" in i.canonical_item_url for i in items))
        self.assertEqual(len({i.canonical_item_url for i in items}), len(items))
        self.assertTrue(any(i.published_at for i in items))

    def test_teaser_sentence_date_is_not_a_publication_date(self):
        from radar.phase1_ingestion_canary import parse_raw_items

        body = '<li><a href="/news/skorton-retire-announcement">Skorton to retire as AAMC president</a> <p>He will retire in June 30, 2027 after a long tenure at the association.</p></li>'
        items = parse_raw_items(source_id="x", source_url="https://x.org/news", body=body, fetch_method="list-page", fetched_at="t")
        self.assertIsNone(items[0].published_at)


if __name__ == "__main__":
    unittest.main()
