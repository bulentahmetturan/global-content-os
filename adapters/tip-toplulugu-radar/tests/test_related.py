from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from radar.database import Database
from radar.models import Candidate


def _candidate(source_id: str, title: str) -> Candidate:
    return Candidate(
        source_id=source_id, source_url=f"https://{source_id}.edu.tr", institution="Üniversite",
        category="scholarship_research", title=title, summary=title,
        content_hash=f"hash-{source_id}-{hash(title)}",
    )


class RelatedCandidateTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.db = Database(Path(self._tmp.name) / "test.sqlite")
        self.db.init()

    def tearDown(self):
        self._tmp.cleanup()

    def test_similar_titles_across_sources_are_linked(self):
        long_title = "2026-2027 Eğitim-Öğretim Yılı Yatay Geçiş Başvuru Sonuçları Açıklandı"
        first_id = self.db.save_candidate(_candidate("osym_duyurular", long_title))
        second_id = self.db.save_candidate(
            _candidate("tip_ankara_duyuru", long_title + " (Ek Duyuru)")
        )
        related = self.db.find_related(long_title, "yeni_kaynak")
        self.assertIn(first_id, [r["id"] for r in related])
        self.assertIn(second_id, [r["id"] for r in related])

    def test_same_source_is_excluded(self):
        long_title = "2026-2027 Eğitim-Öğretim Yılı Yatay Geçiş Başvuru Sonuçları Açıklandı"
        self.db.save_candidate(_candidate("osym_duyurular", long_title))
        related = self.db.find_related(long_title, "osym_duyurular")
        self.assertEqual(related, [])

    def test_short_titles_never_match(self):
        self.db.save_candidate(_candidate("tip_ikcu_duyuru", "Duyurular"))
        related = self.db.find_related("Duyurular", "tip_ege_duyuru")
        self.assertEqual(related, [])

    def test_unrelated_titles_do_not_match(self):
        self.db.save_candidate(
            _candidate("tip_ege_duyuru", "2026 Akademik Yılı Ders Kayıt Takvimi Yayımlandı")
        )
        related = self.db.find_related(
            "TÜBİTAK 2209-A Başvuru Sonuçları Açıklandı Bilgilendirme", "tip_ankara_duyuru"
        )
        self.assertEqual(related, [])

    def test_set_and_add_related_persist(self):
        first_id = self.db.save_candidate(_candidate("a", "x" * 30))
        second_id = self.db.save_candidate(_candidate("b", "y" * 30))
        self.db.set_related(first_id, [second_id])
        self.db.add_related(second_id, first_id)
        row_a = next(r for r in self.db.list_candidates() if r["id"] == first_id)
        row_b = next(r for r in self.db.list_candidates() if r["id"] == second_id)
        import json
        self.assertEqual(json.loads(row_a["related_ids_json"]), [second_id])
        self.assertEqual(json.loads(row_b["related_ids_json"]), [first_id])


    def test_find_by_exam_cycle_groups_stages_across_source(self):
        guide_id = self.db.save_candidate(
            _candidate("osym_tus", "2026-TUS 1. Dönem Kılavuzu ve Başvuru Bilgileri")
        )
        result_id = self.db.save_candidate(
            _candidate("osym_tus", "2026-TUS 1. Dönem Yerleştirme Sonuçları Açıklandı")
        )
        from radar.audience import extract_exam_cycle_key
        key = extract_exam_cycle_key("2026-TUS 1. Dönem Kılavuzu ve Başvuru Bilgileri")
        matches = self.db.find_by_exam_cycle(key, exclude_id=guide_id)
        self.assertIn(result_id, [r["id"] for r in matches])

    def test_find_by_exam_cycle_excludes_different_period(self):
        first_id = self.db.save_candidate(_candidate("osym_tus", "2026-TUS 1. Dönem Kılavuzu"))
        self.db.save_candidate(_candidate("osym_tus", "2026-TUS 2. Dönem Kılavuzu"))
        from radar.audience import extract_exam_cycle_key
        key = extract_exam_cycle_key("2026-TUS 1. Dönem Kılavuzu")
        matches = self.db.find_by_exam_cycle(key, exclude_id=first_id)
        self.assertEqual(matches, [])


if __name__ == "__main__":
    unittest.main()
