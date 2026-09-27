"""Research / medical-AI / consumer-media policy fixtures."""
from __future__ import annotations

import unittest

from radar.hekimler_research_policy import (
    classify_consumer_media,
    classify_medical_ai,
    classify_research_candidate,
    load_research_policy,
    pubmed_record_complete,
    research_provenance_ok,
    verify_kaduse_bundle_references,
)


class ResearchPolicyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.policy = load_research_policy()

    def test_kaduse_sources_referenced_not_duplicated(self):
        ok, msg = verify_kaduse_bundle_references(self.policy)
        if not ok and "missing dependency" in str(msg):
            self.skipTest(f"sibling channel-content-os checkout not available: {msg}")
        self.assertTrue(ok, msg)
        refs = self.policy["kaduse_research_evidence_bundle"]["referenced_source_ids"]
        self.assertIn("nejm", refs)
        self.assertNotIn("stat-news", refs)
        self.assertNotIn("medrxiv-preprint", refs)
        # Bundle is reference_only — no copied publisher rows in Hekimler sources list
        hekimler_ids = {s["source_id"] for s in self.policy["sources"]}
        self.assertNotIn("nejm", hekimler_ids)

    def test_pubmed_requires_pmid_status_design(self):
        ok, missing = pubmed_record_complete(
            {"PMID": "123", "publication_status": "peer_reviewed_published", "study_design": "randomized_controlled_trial"}
        )
        self.assertTrue(ok)
        bad, miss = pubmed_record_complete({"title": "x"})
        self.assertFalse(bad)
        self.assertIn("PMID", miss)
        self.assertIn("publication_status", miss)
        self.assertIn("study_design", miss)

    def test_published_rct_enters_research_review(self):
        d = classify_research_candidate(
            study_design="randomized_controlled_trial",
            publication_status="peer_reviewed_published",
            limitations="single-centre",
            practical_significance="may inform specialty practice after review",
            primary_url="https://www.nejm.org/doi/full/example",
            pmid="999",
        )
        self.assertEqual(d.route, "RESEARCH_REVIEW")
        self.assertFalse(d.feed_eligible)

    def test_animal_study_not_generalized_clinical_claim(self):
        d = classify_research_candidate(
            study_design="animal_study",
            publication_status="peer_reviewed_published",
            limitations="animal model",
            practical_significance="hypothesis-generating",
            primary_url="https://example.org/paper",
        )
        self.assertEqual(d.route, "RESEARCH_WATCH")
        self.assertFalse(d.feed_eligible)

    def test_preprint_not_feed_eligible(self):
        d = classify_research_candidate(
            study_design="randomized_controlled_trial",
            publication_status="preprint",
            limitations="not peer reviewed",
            practical_significance="early signal",
            primary_url="https://www.medrxiv.org/content/example",
        )
        self.assertIn(d.route, {"RESEARCH_WATCH", "NEEDS_REVIEW"})
        self.assertFalse(d.feed_eligible)

    def test_retracted_discard(self):
        d = classify_research_candidate(
            study_design="randomized_controlled_trial",
            publication_status="retracted",
            limitations="retracted",
            practical_significance="n/a",
            primary_url="https://example.org/r",
        )
        self.assertEqual(d.route, "DISCARD")

    def test_ai_internal_validation_not_clinically_ready(self):
        d = classify_medical_ai(
            validation_type="internal_only",
            external_validation_present=False,
            prospective_validation_present=False,
        )
        self.assertEqual(d.route, "AI_REVIEW")
        self.assertFalse(d.clinically_ready)

    def test_consumer_media_trend_inbox_only(self):
        d = classify_consumer_media(
            source_id="healthline_discovery",
            primary_url="https://pubmed.ncbi.nlm.nih.gov/1/",
            primary_supports_claim=True,
        )
        self.assertEqual(d.route, "TREND_INBOX")
        self.assertFalse(d.publication_eligible)
        self.assertFalse(d.feed_eligible)

    def test_consumer_cannot_be_primary_source(self):
        for sid in ("healthline_discovery", "webmd_discovery", "medical_news_today_discovery"):
            src = next(s for s in self.policy["sources"] if s["source_id"] == sid)
            self.assertEqual(src["source_role"], "DISCOVERY_ONLY")
            self.assertFalse(src["publication_eligible"])
            self.assertEqual(src["allowed_routes"], ["TREND_INBOX", "DISCARD"])

    def test_consumer_without_primary_discarded(self):
        d = classify_consumer_media(source_id="webmd_discovery", primary_url=None)
        self.assertEqual(d.route, "DISCARD")

    def test_research_provenance_fields(self):
        ok, missing = research_provenance_ok(
            {
                "primary_url": "https://doi.org/10.1/x",
                "index_url": "https://pubmed.ncbi.nlm.nih.gov/1/",
                "limitations": "small n",
                "PMID": "1",
                "DOI": "10.1/x",
            }
        )
        self.assertTrue(ok, missing)


if __name__ == "__main__":
    unittest.main()
