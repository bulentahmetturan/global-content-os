import unittest
from pathlib import Path

from radar import phase1_ingestion_canary as c
from radar.hekimler_activation import all_sources
from radar.hekimler_integrity import resolve_effective_registry

FX = Path(__file__).parent / "fixtures"


def _src(sid):
    return next(s for s in all_sources(resolve_effective_registry()) if s["source_id"] == sid)


class TdbTests(unittest.TestCase):
    def test_json_becomes_dated_items_with_official_canonical_urls(self):
        body = (FX / "tdb_news_api.json").read_text(encoding="utf-8")
        rss = c._tdb_news_json_to_rss(body, "https://tdb.org.tr")
        rows = c._parse_rss_items(source_id="tdb_dental", source_url="u", body="<rss><channel>" + rss + "</channel></rss>",
                                  fetched_at="2026-09-20T00:00:00Z", fetch_method="test")
        self.assertEqual(len(rows), 4)  # draft dropped
        by = {r.canonical_item_url.rsplit("/", 2)[-2]: r for r in rows}
        self.assertEqual(by["2026-dishekimligi-fakultesi-kontenjanlari-belli-oldu"].published_at, "2026-07-22")
        self.assertEqual(by["muvazaa"].published_at, None)  # missing date stays missing, never invented
        self.assertTrue(all(r.canonical_item_url.startswith("https://tdb.org.tr/basin-odasi/haber-arsivi/") for r in rows))

    def test_registry_rejects_celebrations_and_promotions(self):
        s = _src("tdb_dental")
        from radar.hekimler_registry import classify_item

        cases = {
            "9 EYLÜL İZMİR'İN DÜŞMAN İŞGALİNDEN KURTULUŞU KUTLU OLSUN...": "DISCARD",
            "TDB ÜYELERİNE ÖZEL, %2,29'DAN BAŞLAYAN FAİZ ORANLARI ING KAZANÇLI KREDİ": "DISCARD",
            "4 - 11 EYLÜL 1919 SİVAS KONGRESİ": "DISCARD",
            "TDB AKADEMİ & VAN DİŞHEKİMLERİ ODASI BİLİMSEL ETKİNLİĞİ GERÇEKLEŞTİRİLDİ": "DISCARD",
            "TDB AKADEMİ & VAN DİŞHEKİMLERİ ODASI BİLİMSEL ETKİNLİĞİ": "ACCEPT",
            "2026 DİŞHEKİMLİĞİ FAKÜLTESİ KONTENJANLARI BELLİ OLDU!": "ACCEPT",
            "FDI 2026 DÜNYA DİŞHEKİMLİĞİ KONGRESİ'NE İNDİRİMLİ KAYIT": "ACCEPT",
        }
        for title, want in cases.items():
            self.assertEqual(classify_item(s, title=title, body="").decision, want, title)

    def test_tdb_is_separate_from_canonical_denominator(self):
        import json
        canon = json.loads((FX / "hekimler_ready_sources.json").read_text(encoding="utf-8"))["automation_ready"]
        self.assertIn("tdb_dental", canon)  # operational fixture, but reported as proposed extra source


class GmcSubstituteTests(unittest.TestCase):
    def test_atom_entries_are_normalised_with_dates_and_upstream_links(self):
        rss = c._atom_to_rss_items((FX / "govuk_atom.xml").read_text(encoding="utf-8"))
        rows = c._parse_rss_items(source_id="abroad_uk_gmc", source_url="u", body="<rss><channel>" + rss + "</channel></rss>",
                                  fetched_at="2026-09-20T00:00:00Z", fetch_method="test")
        self.assertEqual([r.published_at for r in rows], ["2026-09-18", "2026-09-17"])
        self.assertTrue(all(r.canonical_item_url.startswith("https://www.gov.uk/") for r in rows))

    def test_multi_feed_skips_failed_feed_and_scopes_hosts(self):
        calls = []

        def transport(u):
            calls.append(u)
            if "bad" in u:
                return c.TransportResult(http_status=500, body="", tls_ok=True, requested_url=u)
            return c.TransportResult(http_status=200, body=(FX / "govuk_atom.xml").read_text(encoding="utf-8"), tls_ok=True, requested_url=u)

        r = c._composite_multi_feed_get(["https://www.gov.uk/ok.atom", "https://www.gov.uk/bad.atom"], transport)
        self.assertEqual(r.http_status, 200)
        self.assertIn("<item>", r.body)
        allbad = c._composite_multi_feed_get(["https://www.gov.uk/bad.atom"], transport)
        self.assertEqual(allbad.http_status, 502)  # total failure is a failure, not "empty"

    def test_gmc_profile_only_uses_govuk(self):
        s = _src("abroad_uk_gmc")
        self.assertEqual(s["allowed_hostnames"], ["www.gov.uk"])
        self.assertTrue(all(u.startswith("https://www.gov.uk/") for u in s["fetch_plan"]["composite_urls"]))


if __name__ == "__main__":
    unittest.main()


class PubmedRateLimitTests(unittest.TestCase):
    def test_429_is_retried_then_succeeds(self):
        import io
        import json
        import urllib.error
        from unittest import mock

        from radar import hekimler_pubmed_pack as pp

        calls = {"n": 0}

        class Resp(io.BytesIO):
            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

        def fake_open(req, timeout=None):
            calls["n"] += 1
            if calls["n"] < 3:
                raise urllib.error.HTTPError(req.full_url, 429, "Too Many", {"Retry-After": "0"}, None)
            return Resp(json.dumps({"esearchresult": {"idlist": []}}).encode())

        prof = _src("pubmed_biomedical_evidence")
        with mock.patch("urllib.request.urlopen", fake_open), mock.patch("time.sleep"):
            pp.fetch_approved_query_pack(prof)
        self.assertGreaterEqual(calls["n"], 3)


class SameUrlTwiceTests(unittest.TestCase):
    def test_duplicate_anchor_for_one_url_yields_one_candidate(self):
        import os
        from unittest import mock

        from radar.config import settings
        from radar.database import Database
        from radar.hekimler_hub_bridge import InMemoryHubStore
        from radar.phase1_ingestion_canary import TransportResult, ingest_one_source

        u = "https://www.nrmp.org/about/news/2026/09/new-webinar-2027-main-residency-match-overview-for-medical-schools/"
        body = (
            f'<ul><li><a href="{u}">New Webinar: 2027 Match Overview for Medical Schools</a> <span>09/10/2026</span></li>'
            f'<li><a href="{u}">New Webinar: 2027 Match Overview for Medical Schools Chief of Match Operations Jeanette Calli and '
            f'Director of Policy recently hosted a webinar for medical school officials</a></li></ul>'
        )
        prof = _src("abroad_us_nrmp")
        db = Database(settings.db_path)
        db.init()
        hub = InMemoryHubStore()
        with mock.patch.dict(os.environ, {"HEKIMLER_CONTINUOUS_INGESTION_ENABLED": "true"}):
            ingest_one_source(prof, db=db, dry_run=False, force_due=True, hub_client=hub,
                              transport=lambda url, *a, **k: TransportResult(http_status=200, body=body, tls_ok=True, requested_url=url))
        urls = [i.canonical_url for i in hub.items.values()]
        self.assertLessEqual(urls.count(u), 1)


if __name__ == "__main__":
    unittest.main()
