from __future__ import annotations

import unittest
from unittest.mock import patch

from radar.analyzer import claude_candidate
from radar.models import FetchResult, Source
from radar.schema import validate_claude_output

VALID = {
    "title": "2026-2027 Akademik Takvim Yayımlandı",
    "summary": "Güz dönemi 21 Eylül 2026'da başlayacak.",
    "institution": "Örnek Üniversitesi",
    "faculty": "Tıp Fakültesi",
    "category": "calendar",
    "event_date": "21.09.2026",
    "deadline": None,
    "student_year": None,
    "city": None,
    "fee": None,
    "eligibility": None,
    "external_facts": ["Güz dönemi 21 Eylül 2026'da başlayacak."],
    "recommended_format": "carousel",
    "urgency_score": 60,
    "confidence_score": 80,
    "human_review_required": True,
    "risk_flags": [],
    "draft_hook": "Yeni akademik takvim çıktı!",
    "draft_caption": "Detaylar için kaynağı inceleyin.",
}


class SchemaTests(unittest.TestCase):
    def test_valid_payload_has_no_errors(self):
        self.assertEqual(validate_claude_output(VALID), [])

    def test_missing_required_field(self):
        data = dict(VALID)
        del data["title"]
        errors = validate_claude_output(data)
        self.assertTrue(any("title" in e for e in errors))

    def test_empty_title_rejected(self):
        data = {**VALID, "title": "   "}
        errors = validate_claude_output(data)
        self.assertTrue(any("title" in e for e in errors))

    def test_bad_recommended_format(self):
        data = {**VALID, "recommended_format": "billboard"}
        errors = validate_claude_output(data)
        self.assertTrue(any("recommended_format" in e for e in errors))

    def test_score_out_of_range(self):
        data = {**VALID, "urgency_score": 150}
        errors = validate_claude_output(data)
        self.assertTrue(any("urgency_score" in e for e in errors))

    def test_score_as_bool_rejected(self):
        data = {**VALID, "confidence_score": True}
        errors = validate_claude_output(data)
        self.assertTrue(any("confidence_score" in e for e in errors))

    def test_external_facts_must_be_string_list(self):
        data = {**VALID, "external_facts": ["ok", 5]}
        errors = validate_claude_output(data)
        self.assertTrue(any("external_facts" in e for e in errors))

    def test_human_review_required_must_be_bool(self):
        data = {**VALID, "human_review_required": "true"}
        errors = validate_claude_output(data)
        self.assertTrue(any("human_review_required" in e for e in errors))

    def test_not_a_dict(self):
        self.assertEqual(validate_claude_output(["a", "b"]), ["Kök öğe JSON nesnesi değil"])

    def test_claude_candidate_raises_on_invalid_schema(self):
        source = Source(
            id="test", name="Test", institution="Üniversite", category="calendar",
            url="https://example.edu.tr", official=True,
        )
        result = FetchResult(
            source=source, content="metin", content_hash="abc",
            fetched_at="2026-08-24T00:00:00+00:00", status_code=200, title="Başlık",
        )
        bad_output = "{" + '"title": "x"' + "}"
        fake = type("R", (), {"stdout": bad_output, "returncode": 0})()
        with patch("radar.analyzer.subprocess.run", return_value=fake):
            with self.assertRaises(ValueError):
                claude_candidate(result, "claude-haiku-4-5")


if __name__ == "__main__":
    unittest.main()
