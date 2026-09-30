"""Bible v4 eligibility helper + policy/vocabulary lock."""
from __future__ import annotations

import json
import unittest
from pathlib import Path

from radar.tip_toplulugu_eligibility import (
    ELIGIBILITY_AXES,
    ELIGIBILITY_STATUSES,
    PRIMARY_CATEGORIES,
    application_may_surface,
    catalog_is_not_license,
    normalize_eligibility_status,
    opportunity_window_label,
    validate_eligibility_record,
)

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "content"


class EligibilityHelperTests(unittest.TestCase):
    def test_status_vocab_and_tr_aliases(self):
        self.assertEqual(normalize_eligibility_status("yes"), "YES")
        self.assertEqual(normalize_eligibility_status("Evet"), "YES")
        self.assertEqual(normalize_eligibility_status("kısmi"), "PARTIAL")
        self.assertEqual(normalize_eligibility_status("hayır"), "NO")
        self.assertEqual(normalize_eligibility_status("garbage"), "UNKNOWN")
        self.assertEqual(tuple(ELIGIBILITY_STATUSES), ("YES", "PARTIAL", "NO", "UNKNOWN", "NOT_APPLICABLE"))
        self.assertEqual(
            ELIGIBILITY_AXES,
            ("application_eligibility", "credential_recognition", "practice_rights"),
        )

    def test_fail_closed_surface(self):
        self.assertTrue(application_may_surface("YES"))
        self.assertTrue(application_may_surface("PARTIAL"))
        self.assertFalse(application_may_surface("NO"))
        self.assertFalse(application_may_surface("UNKNOWN"))
        self.assertFalse(application_may_surface("NOT_APPLICABLE"))
        self.assertEqual(opportunity_window_label(state="open", deadline_known=False), "unknown")
        self.assertEqual(opportunity_window_label(state="open", deadline_known=True), "open")
        self.assertTrue(catalog_is_not_license())

    def test_record_requires_three_axes(self):
        ok, reason = validate_eligibility_record(
            {
                "application_eligibility": "YES",
                "credential_recognition": "NOT_APPLICABLE",
                "practice_rights": "NO",
            }
        )
        self.assertTrue(ok)
        self.assertEqual(reason, "ok")
        bad, why = validate_eligibility_record({"application_eligibility": "YES"})
        self.assertFalse(bad)
        self.assertIn("missing_axis", why)


class BibleArtifactsTests(unittest.TestCase):
    def test_controlled_vocabulary_matches_bible(self):
        vocab = json.loads((CONTENT / "taxonomy" / "controlled-vocabulary.json").read_text(encoding="utf-8"))
        self.assertEqual(vocab["bibleVersion"], "4.0")
        self.assertEqual(tuple(vocab["primary_category"]), PRIMARY_CATEGORIES)
        self.assertEqual(tuple(vocab["eligibility_status"]), ELIGIBILITY_STATUSES)

    def test_config_weights_and_no_auto_publish(self):
        cfg = json.loads((CONTENT / "config" / "bible-config.json").read_text(encoding="utf-8"))
        self.assertEqual(cfg["bibleVersion"], "4.0")
        self.assertIs(cfg["auto_publish"], False)
        self.assertIs(cfg["fail_closed"], True)
        weights = cfg["ranking_weights"]
        self.assertAlmostEqual(sum(weights.values()), 1.0, places=6)
        self.assertLess(weights["engagement_potential"], weights["turkey_relevance"])
        self.assertLess(weights["engagement_potential"], weights["verification_quality"])
        scores = cfg["eligibility_research_score"]
        self.assertAlmostEqual(sum(scores.values()), 1.0, places=6)
        self.assertEqual(cfg["news_max_age_days"], 10)

    def test_five_category_policies_exist_and_lock_publish(self):
        files = {
            "haber": CONTENT / "policies" / "haber-policy.json",
            "research": CONTENT / "policies" / "research-policy.json",
            "duyuru": CONTENT / "policies" / "tip-toplulugu-duyuru-policy.json",
            "burs": CONTENT / "policies" / "tip-toplulugu-burs-policy.json",
            "egitim": CONTENT / "policies" / "tip-toplulugu-egitim-policy.json",
        }
        for cat, path in files.items():
            data = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(data["bibleVersion"], "4.0", cat)
            self.assertEqual(data["primary_category"], cat, cat)
            self.assertIs(data["auto_publish"], False, cat)
            self.assertIs(data.get("publication_eligible"), False, cat)

    def test_burs_egitim_lane_split_and_axes(self):
        burs = json.loads((CONTENT / "policies" / "tip-toplulugu-burs-policy.json").read_text(encoding="utf-8"))
        egitim = json.loads((CONTENT / "policies" / "tip-toplulugu-egitim-policy.json").read_text(encoding="utf-8"))
        self.assertEqual(burs["lane_split"]["named_observership_preceptorship"], "egitim")
        self.assertEqual(burs["lane_split"]["funded_award_with_placement"], "burs")
        self.assertEqual(burs["lane_split"]["generic_unpaid_staj"], "out_until_staj_lane")
        self.assertTrue(egitim["lane_split"]["catalog_is_not_tuk_getat_license"])
        self.assertEqual(set(burs["eligibility_axes"]), set(ELIGIBILITY_AXES))
        self.assertEqual(set(egitim["eligibility_axes"]), set(ELIGIBILITY_AXES))


if __name__ == "__main__":
    unittest.main()
