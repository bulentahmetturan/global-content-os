"""Owner-decided narrowing (2026-11-02) for Resmî Gazete, TİTCK (genel + geri çekme) and TÜİK, on REAL page content.

Fixtures are saved live pages: TİTCK /duyuru card grid, four recall detail pages, the recall RSS head, the Resmî Gazete
fihrist of 2026-11-02. Decisions asserted here come from the owner's accept/reject answers, not from keyword guesses.
"""
from __future__ import annotations

import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from radar.database import Database
from radar.phase1_ingestion_canary import TransportResult, extract_detail_body, ingest_one_source, parse_raw_items
from radar.tip_toplulugu_continuous_runner import export_automation_ready_profiles
from radar.tip_toplulugu_dates import extract_dates
from radar.tip_toplulugu_fetch import classify_with_congress_gate

FX = Path(__file__).parent / "fixtures" / "official_sources"
PROFILES = {p["source_id"]: p for p in export_automation_ready_profiles()}
CUTS = ["FAYDALI LİNKLER", "Ek Dokümanlar"]


def read(name: str) -> str:
    return (FX / name).read_text(encoding="utf-8")


def decide(sid: str, title: str, body: str = "") -> str:
    return classify_with_congress_gate(PROFILES[sid], title=title, body=body).decision


def cards():
    return parse_raw_items(
        source_id="titck_announcements_general", source_url="https://www.titck.gov.tr/duyuru",
        body=read("titck_duyuru_cards.html"), fetch_method="GET", fetched_at="2026-11-02T00:00:00Z",
    )


class TitckCardParserTests(unittest.TestCase):
    def test_only_real_cards_become_items(self):
        items = cards()
        self.assertEqual(len(items), 10)
        self.assertTrue(all(i.canonical_item_url.startswith("https://www.titck.gov.tr/duyuru/") for i in items))
        self.assertTrue(all(i.published_at for i in items))

    def test_card_text_carries_unit_and_tags(self):
        eys = next(i for i in cards() if "EYS" in i.title)
        self.assertEqual(eys.published_at, "2026-10-19")
        self.assertIn("Eczane", eys.raw_excerpt)


class TitckGeneralPolicyTests(unittest.TestCase):
    def verdict(self, item) -> str:
        return decide("titck_announcements_general", item.title, item.raw_excerpt)

    def test_eys_application_window_is_accepted(self):
        eys = next(i for i in cards() if "EYS" in i.title)
        self.assertEqual(self.verdict(eys), "ACCEPT")

    def test_firm_facing_sector_and_internal_notices_are_rejected(self):
        rejected = [i for i in cards() if "EYS" not in i.title]
        self.assertGreaterEqual(len(rejected), 8)
        for item in rejected:
            with self.subTest(item.title[:60]):
                self.assertEqual(self.verdict(item), "DISCARD")


class TitckRecallPolicyTests(unittest.TestCase):
    """RSS titles are blind; the decision is made on the real detail body."""

    def body(self, n: int) -> str:
        return extract_detail_body(read(f"titck_detail_{n}.html"), selector="v2-detail-body", cut_markers=CUTS, max_chars=3000)

    def test_footer_menu_never_reaches_the_gate(self):
        for n in (5374, 5376, 5371):
            self.assertNotIn("Kozmetik İstenmeyen Etki", self.body(n))
            self.assertNotIn("FAYDALI", self.body(n))

    def test_drug_recall_is_accepted(self):
        self.assertEqual(decide("titck_geri_cekme", "İlaç Geri Çekme - 5374", self.body(5374)), "ACCEPT")

    def test_biocide_recalls_are_rejected_by_owner_rule(self):
        self.assertEqual(decide("titck_geri_cekme", "Kamuoyunun Dikkatine - 5376", self.body(5376)), "DISCARD")  # cerrahi tırnak fırçası
        self.assertEqual(decide("titck_geri_cekme", "Kamuoyunun Dikkatine - 5371", self.body(5371)), "DISCARD")  # el dezenfektanı

    def test_cosmetic_guideline_is_rejected(self):
        self.assertEqual(decide("titck_geri_cekme", "Güncellenen Kılavuz Hakkında - 5366", self.body(5366)), "DISCARD")

    def test_fake_and_smuggled_drug_warning_is_accepted(self):
        text = "İnternet üzerinden satılan sahte ilaç tespit edilmiştir; kullanılmaması önemle duyurulur."
        self.assertEqual(decide("titck_geri_cekme", "Kamuoyunun Dikkatine", text), "ACCEPT")

    def test_device_recall_is_accepted(self):
        text = "Ruhsat sahibi firma tarafından tıbbi cihaz kateter setinin ilgili serisi geri çekilmiştir."
        self.assertEqual(decide("titck_geri_cekme", "Tıbbi Cihaz Uyarı", text), "ACCEPT")


class ResmiGazetePolicyTests(unittest.TestCase):
    def test_issue_page_urls_carry_their_date(self):
        self.assertEqual(str(extract_dates("https://www.resmigazete.gov.tr/eskiler/2026/11/20261102-5.htm")[0]), "2026-11-02")
        self.assertEqual(str(extract_dates("https://www.resmigazete.gov.tr/eskiler/2026/11/20261101.pdf")[0]), "2026-11-01")

    def test_health_titles_pass_the_content_gate(self):
        for t in (
            "Sivas Cumhuriyet Üniversitesi Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönetmeliği",
            "Sağlık Uygulama Tebliğinde Değişiklik Yapılmasına Dair Tebliğ",
            "Tütün Ürünlerinin Üretim Usul ve Esasları Hakkında Yönetmelik",
            "Beşeri Tıbbi Ürünlerin Geri Ödeme Listesinde Değişiklik",
        ):
            with self.subTest(t):
                self.assertEqual(decide("resmi_gazete_medical_regulation", t), "ACCEPT")

    def test_non_health_titles_are_rejected(self):
        for t in ("Yargı İlânları", "Karayolları Genel Müdürlüğü Yönetmeliği", "T.C. Merkez Bankasınca Belirlenen Devlet İç Borçlanma Senetlerinin Günlük Değerleri"):
            with self.subTest(t):
                self.assertEqual(decide("resmi_gazete_medical_regulation", t), "DISCARD")

    def test_live_fihrist_yields_exactly_the_medical_faculty_regulation(self):
        sid = "resmi_gazete_medical_regulation"
        items = parse_raw_items(source_id=sid, source_url="https://www.resmigazete.gov.tr/fihrist?tarih=2026-11-02", body=read("resmigazete_fihrist_2026-11-02.html"), fetch_method="GET", fetched_at="2026-11-02T08:00:00Z")
        titles = [i.title for i in items if decide(sid, i.title) == "ACCEPT"]
        self.assertEqual(len(titles), 1)
        self.assertIn("Tıp Fakültesi", titles[0])


class TuikPolicyTests(unittest.TestCase):
    def test_owner_selected_bulletins_pass(self):
        for t in ("Sağlık Harcamaları İstatistikleri, 2025", "Doğum İstatistikleri, 2025", "Ölüm ve Ölüm Nedeni İstatistikleri, 2025", "Yaşam Tabloları, 2023-2025", "Türkiye Sağlık Araştırması, 2025", "Engelli ve Yaşlı İstatistikleri, 2025", "Çocuk İstatistikleri, 2025"):
            with self.subTest(t):
                self.assertEqual(decide("tuik_medical_public_health", t), "ACCEPT")

    def test_other_bulletins_are_rejected(self):
        for t in ("Araştırma-Geliştirme Faaliyetleri Araştırması, 2025", "Karayolu Trafik Kaza İstatistikleri, 2025", "Gelir ve Yaşam Koşulları Araştırması, 2025", "Dış Ticaret İstatistikleri, Eylül 2026", "Ekonomik Güven Endeksi, Ekim 2026"):
            with self.subTest(t):
                self.assertEqual(decide("tuik_medical_public_health", t), "DISCARD")


class DetailGateRunTests(unittest.TestCase):
    """End to end on the recall RSS: stale items are never fetched, unreadable pages fail closed, budget defers."""

    def run_gate(self, pages: dict[str, str], max_fetches: int = 25):
        profile = {**PROFILES["titck_geri_cekme"]}
        profile["fetch_plan"] = {**profile["fetch_plan"], "detail_gate": {**profile["fetch_plan"]["detail_gate"], "max_fetches": max_fetches}}
        fetched: list[str] = []

        def transport(url: str) -> TransportResult:
            fetched.append(url)
            if url.endswith("recallAnnouncementFeeds"):
                return TransportResult(200, read("titck_recall_feed.xml"), True, url)
            body = pages.get(url)
            return TransportResult(200 if body is not None else 404, body or "", True, url)

        db = Database(Path(tempfile.mkdtemp()) / "t.sqlite")
        res = ingest_one_source(profile, db=db, dry_run=True, transport=transport, force_due=True, now=datetime(2026, 10, 6, tzinfo=timezone.utc))
        return res, [u for u in fetched if "/duyuru/" in u]

    def pages(self):
        return {f"https://www.titck.gov.tr/duyuru/{n}": read(f"titck_detail_{n}.html") for n in (5374, 5376, 5371, 5366)}

    def test_accepts_the_drug_recall_and_only_fetches_candidate_pages(self):
        res, detail_fetches = self.run_gate(self.pages())
        self.assertGreaterEqual(res.accepted_count, 1)
        self.assertLessEqual(len(detail_fetches), 7)

    def test_unreadable_detail_page_is_not_accepted(self):
        res, _ = self.run_gate({})
        self.assertEqual(res.accepted_count, 0)

    def test_fetch_budget_defers_instead_of_deciding(self):
        _, detail_fetches = self.run_gate(self.pages(), max_fetches=1)
        self.assertLessEqual(len(detail_fetches), 1)


if __name__ == "__main__":
    unittest.main()
