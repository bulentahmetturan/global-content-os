"""Opportunity pack mapping fixtures — references existing faculty/curator inventory."""
from __future__ import annotations

import unittest
from datetime import date

from radar.hekimler_opportunity_pack import (
    classify_opportunity,
    classify_source_class,
    load_faculty_announcement_refs,
    load_opportunity_pack,
    opportunity_inventory_dependency_ok,
    viral_cannot_change_opportunity_rank,
)


class OpportunityPackTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pack = load_opportunity_pack()
        ok, msg = opportunity_inventory_dependency_ok()
        assert ok, msg
        cls.refs = load_faculty_announcement_refs()

    def test_faculty_sources_referenced_not_duplicated(self):
        self.assertGreater(len(self.refs), 80)
        ids = [r["id"] for r in self.refs]
        self.assertEqual(len(ids), len(set(ids)))
        # Pack does not embed a second copy of 84 faculty rows
        self.assertNotIn("sources", self.pack)  # mapping only
        self.assertTrue(self.pack["dependency"]["do_not_recreate_faculty_list"])
        tip = [r for r in self.refs if r["source_class"] == "OFFICIAL_MEDICAL_FACULTY"]
        cur = [r for r in self.refs if r["source_class"] == "CURATOR_DISCOVERY"]
        self.assertGreater(len(tip), 50)
        # Curator (Instagram) rows are discovery-only; their number follows the committed inventory, not a fixed
        # snapshot, so derive the expectation independently from the ids/URLs instead of hard-coding it.
        ig = [r for r in self.refs if "instagram.com" in (r["url"] or "").lower() or r["id"].startswith("ig_")
              or r["id"] in {"antbat_ankara", "ivsa_ankara"}]
        self.assertEqual(len(cur), len(ig))
        self.assertTrue(all(not r["official"] or r["source_class"] == "CURATOR_DISCOVERY" for r in ig))

    def test_official_scholarship_routes_opportunity(self):
        d = classify_opportunity(
            title="Tıp Fakültesi Araştırma Bursu Çağrısı",
            source_class="OFFICIAL_MEDICAL_FACULTY",
            official_source_url="https://tip.example.edu.tr/burs",
            eligibility_requirements="tıp öğrencisi 3. sınıf+",
            deadline="2027-01-15",
            application_url="https://tip.example.edu.tr/basvuru",
            opportunity_type="scholarship",
            today=date(2026, 9, 19),
        )
        self.assertEqual(d.route, "OPPORTUNITY")
        self.assertEqual(d.verification_status, "OFFICIAL_VERIFIED")

    def test_curator_without_official_link(self):
        d = classify_opportunity(
            title="Yeni staj fırsatı",
            source_class="CURATOR_DISCOVERY",
            official_source_url=None,
            eligibility_requirements="tıp öğrencisi",
            deadline="2027-01-15",
            application_url="https://instagram.com/x",
        )
        self.assertNotEqual(d.route, "OPPORTUNITY")
        self.assertEqual(d.verification_status, "CURATOR_SIGNAL_PENDING_VERIFICATION")

    def test_missing_eligibility_or_deadline_blocks_publication(self):
        d = classify_opportunity(
            title="Exchange program",
            source_class="OFFICIAL_MEDICAL_FACULTY",
            official_source_url="https://tip.example.edu.tr/x",
            eligibility_requirements=None,
            deadline=None,
            application_url=None,
        )
        self.assertFalse(d.publication_eligible)
        self.assertEqual(d.verification_status, "INSUFFICIENT_INFORMATION")

    def test_expired_excluded(self):
        d = classify_opportunity(
            title="Burs",
            source_class="OFFICIAL_MEDICAL_FACULTY",
            official_source_url="https://tip.example.edu.tr/b",
            eligibility_requirements="tıp",
            deadline="2020-01-01",
            application_url="https://tip.example.edu.tr/a",
            today=date(2026, 9, 19),
        )
        self.assertEqual(d.verification_status, "EXPIRED")
        self.assertEqual(d.route, "DISCARD")

    def test_viral_cannot_change_rank(self):
        base = ("fit", "deadline", "relevance")
        self.assertEqual(viral_cannot_change_opportunity_rank(99, base), base)
        self.assertEqual(viral_cannot_change_opportunity_rank(0, base), base)

    def test_congress_handoff(self):
        d = classify_opportunity(
            title="Ulusal Kardiyoloji Kongresi Erken Kayıt",
            source_class="OFFICIAL_MEDICAL_FACULTY",
            official_source_url="https://tip.example.edu.tr/k",
            eligibility_requirements="hekim",
            deadline="2027-01-01",
            application_url="https://tip.example.edu.tr/a",
        )
        self.assertEqual(d.handoff_target, "CONGRESS_REGISTRY")
        self.assertFalse(d.publication_eligible)

    def test_generic_university_news_discard(self):
        d = classify_opportunity(
            title="Rektör ziyareti ve açılış töreni",
            source_class="OFFICIAL_UNIVERSITY_MEDICAL_UNIT",
            official_source_url="https://uni.example.edu.tr/haber",
            eligibility_requirements=None,
            deadline=None,
            application_url=None,
        )
        self.assertEqual(d.route, "DISCARD")

    def test_classify_source_class_patterns(self):
        self.assertEqual(
            classify_source_class({"id": "tip_ankara_duyuru", "url": "https://ankara.edu.tr/tip"}),
            "OFFICIAL_MEDICAL_FACULTY",
        )
        self.assertEqual(
            classify_source_class({"id": "ig_turkmsic", "url": "https://instagram.com/turkmsic"}),
            "CURATOR_DISCOVERY",
        )


if __name__ == "__main__":
    unittest.main()
