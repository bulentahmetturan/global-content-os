"""Trusted Trend Radar + Question Demand Radar policy fixtures."""
from __future__ import annotations

import unittest

from radar.hekimler_trend_demand_policy import (
    classify_question_demand,
    classify_trend_candidate,
    evidence_file_complete,
    load_trend_demand_policy,
    promote_question_to_evidence,
)


class TrendDemandPolicyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.policy = load_trend_demand_policy()

    def test_policy_wired_off(self):
        self.assertFalse(self.policy["pipeline_wiring_enabled"])
        self.assertFalse(self.policy["auto_publish"])
        self.assertFalse(self.policy["fetch_enabled"])

    def test_official_source_can_create_trend_candidate(self):
        d = classify_trend_candidate(
            source_class="OFFICIAL_PRIMARY",
            primary_url="https://www.osym.gov.tr/SinavGrubu/Index/6",
        )
        self.assertEqual(d.route, "TREND_CANDIDATE")
        self.assertTrue(d.may_create_trend_candidate)
        self.assertFalse(d.publication_eligible)

    def test_reddit_cannot_create_trend_candidate(self):
        d = classify_trend_candidate(
            source_class="reddit",
            primary_url=None,
        )
        self.assertEqual(d.route, "QUESTION_BRIEF")
        self.assertFalse(d.may_create_trend_candidate)

    def test_consumer_health_cannot_create_trend_alone(self):
        d = classify_trend_candidate(
            source_class="consumer_health_article",
            primary_url="https://www.healthline.com/example",
        )
        self.assertEqual(d.route, "QUESTION_BRIEF")
        self.assertFalse(d.may_create_trend_candidate)

    def test_google_trends_cannot_create_trend(self):
        d = classify_trend_candidate(source_class="google_trends", primary_url=None)
        self.assertFalse(d.may_create_trend_candidate)
        self.assertEqual(d.output_level, "QUESTION_BRIEF")

    def test_official_social_still_needs_primary_url(self):
        d = classify_trend_candidate(
            source_class="OFFICIAL_PRIMARY",
            primary_url=None,
            official_social_pointer=True,
        )
        self.assertEqual(d.route, "NEEDS_REVIEW")
        self.assertIn("primary", d.reason.lower())

    def test_question_demand_creates_question_brief_only(self):
        d = classify_question_demand(
            signal_class="turkish_search_trend",
            normalized_question="TUS tercih süreci nasıl işler?",
            audience_segments=["medical_student"],
        )
        self.assertEqual(d.route, "QUESTION_BRIEF")
        self.assertFalse(d.publication_eligible)

    def test_demand_signal_never_proves_truth(self):
        never = self.policy["question_demand_radar"]["never_proves"]
        self.assertIn("claim_is_true", never)
        self.assertIn("claim_is_medically_correct", never)

    def test_evidence_file_requires_all_fields(self):
        incomplete = {"normalized_question": "x", "primary_urls": ["https://a"]}
        ok, missing = evidence_file_complete(incomplete)
        self.assertFalse(ok)
        self.assertIn("limitations", missing)
        self.assertIn("uncertainty_level", missing)

    def test_promote_without_primary_discards_or_reviews(self):
        d = promote_question_to_evidence(
            normalized_question="Asistan nöbet ücreti nasıl hesaplanır?",
            primary_urls=None,
            evidence_supported=False,
        )
        self.assertIn(d.route, {"DISCARD", "NEEDS_REVIEW"})
        self.assertFalse(d.publication_eligible)

    def test_promote_with_evidence_to_brief(self):
        fields = {k: "x" for k in (
            "normalized_question", "why_the_question_matters", "audience_segments",
            "demand_signal_urls", "primary_urls", "evidence_type", "publication_status",
            "practical_answer", "limitations", "uncertainty_level", "risk_flags",
            "last_verified_at",
        )}
        d = promote_question_to_evidence(
            normalized_question="TUS başvuru tarihi nedir?",
            primary_urls=["https://www.osym.gov.tr/x"],
            evidence_supported=True,
            evidence_file_fields=fields,
            complexity="card",
        )
        self.assertEqual(d.route, "VERIFIED_ANSWER_CARD")
        self.assertFalse(d.publication_eligible)

    def test_weak_evidence_not_filled_from_social(self):
        d = promote_question_to_evidence(
            normalized_question="Bu mucize tedavi işe yarar mı?",
            primary_urls=["https://reddit.com/r/x"],
            evidence_supported=False,
            evidence_weak_or_conflicting=True,
        )
        self.assertIn("social", d.reason.lower())
        self.assertFalse(d.publication_eligible)

    def test_ai_must_not_invent_evidence_rule_present(self):
        rules = " ".join(self.policy["hard_rules"]).lower()
        self.assertIn("never infer an answer from demand signals", rules)
        self.assertIn("invent missing evidence", rules)


if __name__ == "__main__":
    unittest.main()
