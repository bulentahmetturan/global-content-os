from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from radar.analyzer import deterministic_candidate
from radar.config import ROOT
from radar.database import Database
from radar.fetchers import normalize_text
from radar.models import Candidate, FetchResult, Source
from radar.pipeline import _apply_change_priority, _apply_deadline_urgency, _tag_genel_kurul
from radar.sources import load_sources


class CoreTests(unittest.TestCase):
    def test_normalize_text(self):
        self.assertEqual(normalize_text("a  \n b\t c"), "a b c")

    def test_candidate_and_dedupe(self):
        source = Source(
            id="test", name="Test", institution="Üniversite", category="calendar",
            url="https://example.edu.tr", official=True,
        )
        result = FetchResult(
            source=source, content="Dersler 21.09.2026 tarihinde başlayacaktır.",
            content_hash="abc", fetched_at="2026-08-24T00:00:00+00:00", status_code=200,
            title="Akademik Takvim",
        )
        candidate = deterministic_candidate(result, True)
        self.assertEqual(candidate.event_date, "21.09.2026")
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
            db = Database(Path(tmp) / "test.sqlite")
            db.init()
            self.assertTrue(db.save_candidate(candidate))
            self.assertFalse(db.save_candidate(candidate))

    def test_resmi_gazete_is_additional_source(self):
        sources = load_sources(ROOT / "sources" / "official_sources.yaml")
        ids = [item.id for item in sources]
        self.assertIn("osym_duyurular", ids)
        self.assertIn("yok_duyurular", ids)
        self.assertIn("tubitak_duyurular", ids)
        self.assertIn("resmi_gazete", ids)
        rg = next(item for item in sources if item.id == "resmi_gazete")
        self.assertEqual(rg.url, "https://www.resmigazete.gov.tr/fihrist?tarih={today}")
        self.assertTrue(rg.enabled)

    def test_verified_faculty_sources_present(self):
        sources = load_sources(ROOT / "sources" / "official_sources.yaml")
        faculty = [item for item in sources if item.category == "faculty_announcement"]
        self.assertGreaterEqual(len(faculty), 80)
        urls = {item.url for item in faculty}
        self.assertNotIn("https://adiyaman.edu.tr", urls)
        ids = {item.id for item in faculty}
        self.assertIn("tip_hacettepe_duyuru", ids)
        self.assertIn("tip_ankara_duyuru", ids)
        self.assertIn("tip_cerrahpasa_ogrenci_duyuru", ids)


    def test_deadline_urgency_boosts_near_candidates(self):
        from datetime import date, timedelta

        candidate = Candidate(
            source_id="test", source_url="https://example.edu.tr", institution="Üniversite",
            category="scholarship_research", title="Başvuru", summary="Başvuru son gün yaklaşıyor.",
            content_hash="abc",
            deadline=(date.today() + timedelta(days=2)).strftime("%d.%m.%Y"),
            urgency_score=30,
        )
        _apply_deadline_urgency(candidate)
        self.assertEqual(candidate.urgency_score, 70)
        self.assertIn("deadline_yakin", candidate.risk_flags)

    def test_deadline_urgency_noop_without_deadline(self):
        candidate = Candidate(
            source_id="test", source_url="https://example.edu.tr", institution="Üniversite",
            category="calendar", title="Başlık", summary="Özet", content_hash="abc", urgency_score=40,
        )
        _apply_deadline_urgency(candidate)
        self.assertEqual(candidate.urgency_score, 40)
        self.assertEqual(candidate.risk_flags, [])

    def test_change_notice_boosts_urgency(self):
        candidate = Candidate(
            source_id="test", source_url="https://example.edu.tr", institution="Üniversite",
            category="calendar", title="Başvuru Tarihinde Değişiklik Yapılmasına Dair Duyuru",
            summary="Son başvuru tarihi ek süre ile uzatılmıştır.", content_hash="abc", urgency_score=40,
        )
        _apply_change_priority(candidate)
        self.assertEqual(candidate.urgency_score, 55)
        self.assertIn("change_notice", candidate.risk_flags)

    def test_regular_notice_unaffected_by_change_priority(self):
        candidate = Candidate(
            source_id="test", source_url="https://example.edu.tr", institution="Üniversite",
            category="calendar", title="2026-2027 Akademik Takvim Yayımlandı",
            summary="Güz dönemi eylülde başlayacak.", content_hash="abc", urgency_score=40,
        )
        _apply_change_priority(candidate)
        self.assertEqual(candidate.urgency_score, 40)
        self.assertNotIn("change_notice", candidate.risk_flags)

    def test_exam_date_change_gets_priority_boost(self):
        candidate = Candidate(
            source_id="test", source_url="https://example.edu.tr", institution="Üniversite",
            category="faculty_announcement", title="Dönem 3 IV. Ders Kurulu Sınav Tarihi Değişikliği",
            summary="", content_hash="abc", urgency_score=50,
        )
        _apply_change_priority(candidate)
        self.assertEqual(candidate.urgency_score, 65)
        self.assertIn("change_notice", candidate.risk_flags)

    def test_genel_kurul_title_is_tagged(self):
        candidate = Candidate(
            source_id="yok_duyurular", source_url="https://yok.gov.tr", institution="YÖK",
            category="central_announcement", title="YÖK Genel Kurul Toplantısı Kararları Yayımlandı",
            summary="Özet", content_hash="abc",
        )
        _tag_genel_kurul(candidate)
        self.assertIn("genel_kurul_karari", candidate.risk_flags)

    def test_non_genel_kurul_title_not_tagged(self):
        candidate = Candidate(
            source_id="yok_duyurular", source_url="https://yok.gov.tr", institution="YÖK",
            category="central_announcement", title="2026-2027 Akademik Takvim Yayımlandı",
            summary="Özet", content_hash="abc",
        )
        _tag_genel_kurul(candidate)
        self.assertNotIn("genel_kurul_karari", candidate.risk_flags)


if __name__ == "__main__":
    unittest.main()

