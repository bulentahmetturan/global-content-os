from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from radar.database import Database
from radar.digest import build_digest
from radar.models import Candidate


def _candidate(source_id: str, title: str, category: str = "calendar", urgency: int = 50) -> Candidate:
    return Candidate(
        source_id=source_id, source_url=f"https://{source_id}.edu.tr", institution="Üniversite",
        category=category, title=title, summary=title, content_hash=f"hash-{title}",
        urgency_score=urgency,
    )


class DigestTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.db = Database(Path(self._tmp.name) / "test.sqlite")
        self.db.init()

    def tearDown(self):
        self._tmp.cleanup()

    def test_empty_digest_message(self):
        text = build_digest(self.db, hours=24)
        self.assertIn("yeni içerik adayı yok", text)

    def test_digest_groups_by_category_and_sorts_by_urgency(self):
        self.db.save_candidate(_candidate("a", "Düşük Öncelik", category="calendar", urgency=20))
        self.db.save_candidate(_candidate("b", "Yüksek Öncelik", category="calendar", urgency=90))
        self.db.save_candidate(_candidate("c", "Burs Duyurusu", category="scholarship_research", urgency=50))
        text = build_digest(self.db, hours=24)
        self.assertIn("Toplam 3 yeni aday", text)
        self.assertIn("## calendar (2)", text)
        self.assertIn("## scholarship_research (1)", text)
        high_pos = text.index("Yüksek Öncelik")
        low_pos = text.index("Düşük Öncelik")
        self.assertLess(high_pos, low_pos)

    def test_digest_includes_deadline_note(self):
        from datetime import date, timedelta
        candidate = _candidate("a", "Son Başvuru Yaklaşıyor")
        candidate.deadline = (date.today() + timedelta(days=1)).strftime("%d.%m.%Y")
        self.db.save_candidate(candidate)
        text = build_digest(self.db, hours=24)
        self.assertIn("son 1 gün", text)


if __name__ == "__main__":
    unittest.main()
