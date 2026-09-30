"""Bible v4 Source Pass/Fail (Kitap II) lock + envelope behaviour."""
from __future__ import annotations

import json
import unittest
from pathlib import Path

from radar.source_pass_fail import (
    BIBLE_VERSION,
    RULESET_VERSION,
    evaluate_item,
    evaluate_source,
    evaluation_track,
    is_technical_issue,
    load_bible_config,
    normalize_score,
    revalidation_triggers,
    turkey_eligibility_applicable,
    turkey_engagement_applicable,
)

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "content"


class TrackAndScoreTests(unittest.TestCase):
    def test_tracks_split_by_category(self):
        self.assertEqual(evaluation_track("haber"), "ENGAGEMENT")
        self.assertEqual(evaluation_track("research"), "ENGAGEMENT")
        self.assertEqual(evaluation_track("duyuru"), "PRAGMATIC_UTILITY")
        self.assertEqual(evaluation_track("burs"), "PRAGMATIC_UTILITY")
        self.assertEqual(evaluation_track("egitim"), "PRAGMATIC_UTILITY")
        self.assertFalse(turkey_eligibility_applicable("haber"))
        self.assertFalse(turkey_eligibility_applicable("research"))
        self.assertTrue(turkey_eligibility_applicable("burs"))
        self.assertTrue(turkey_engagement_applicable("haber"))
        self.assertFalse(turkey_engagement_applicable("egitim"))

    def test_na_not_scored_zero(self):
        # Missing criterion is omitted from maximum; not counted as 0.
        env = evaluate_source(
            source_id="src_news",
            category="haber",
            soft_breakdown={"authority": 18, "topic_audience_relevance": 16},
            observation_count=4,
            data_completeness=0.6,
        )
        self.assertEqual(env["maximum_applicable_score"], 40)
        self.assertEqual(env["earned_score"], 34)
        self.assertEqual(env["normalized_score"], normalize_score(34, 40))
        self.assertNotIn("engagement_potential", env["soft_breakdown"])
        self.assertEqual(env["evaluation_track"], "ENGAGEMENT")
        self.assertIs(env["turkey_engagement"]["applicable"], True)
        self.assertIs(env["pragmatic_utility"]["applicable"], False)
        self.assertIsNone(env["application_eligibility"])

    def test_http_403_is_not_source_fail(self):
        env = evaluate_source(
            source_id="src_blocked",
            category="research",
            http_status=403,
            technical_codes=["403", "captcha"],
            soft_breakdown={"authority": 18, "topic_audience_relevance": 18, "technical_health": 4},
            rss=True,
            observation_count=6,
            data_completeness=0.7,
        )
        self.assertFalse(env["hard_fail"])
        self.assertNotEqual(env["editorial_decision"], "FAIL")
        self.assertEqual(env["ingestion_mode"], "MANUAL_ONLY")
        self.assertIn(env["lifecycle_status"], {"manual_only", "degraded", "paused", "verified"})
        self.assertIn("TECHNICAL_NOT_HARD_FAIL", env["reason_codes"])
        self.assertTrue(is_technical_issue("403"))

    def test_hard_fail_only_for_named_codes(self):
        env = evaluate_source(
            source_id="spam",
            category="haber",
            hard_fail_reasons=["SPAM_LINK_FARM"],
            soft_breakdown={"authority": 20},
        )
        self.assertTrue(env["hard_fail"])
        self.assertEqual(env["editorial_decision"], "FAIL")
        self.assertEqual(env["lifecycle_status"], "denylisted")
        self.assertEqual(env["ingestion_mode"], "BLOCKED")

    def test_low_score_is_watch_not_fail(self):
        env = evaluate_source(
            source_id="weak",
            category="duyuru",
            soft_breakdown={"authority_official": 8, "turkey_audience_fit": 8},
        )
        self.assertEqual(env["editorial_decision"], "WATCH")
        self.assertFalse(env["hard_fail"])
        self.assertEqual(env["evaluation_track"], "PRAGMATIC_UTILITY")

    def test_item_reject_does_not_fail_source(self):
        item = evaluate_item(
            source_id="burs_tr_fulbright",
            category="burs",
            turkey_citizen_allowed="NO",
            turkey_based_applicant_allowed="NO",
            source_editorial="PASS",
        )
        self.assertEqual(item["item_decision"], "REJECT")
        self.assertFalse(item["source_fail_implied"])
        src = evaluate_source(
            source_id="burs_tr_fulbright",
            category="burs",
            item_reject_count=1,
            soft_breakdown={"authority_official": 18, "turkey_audience_fit": 20, "actionability": 16},
        )
        self.assertNotEqual(src["editorial_decision"], "FAIL")
        self.assertIn("ITEM_REJECT_ISOLATED", src["reason_codes"])

    def test_expired_duyuru_item_reject(self):
        item = evaluate_item(source_id="sb", category="duyuru", expired=True)
        self.assertEqual(item["item_decision"], "REJECT")
        self.assertIn("DEADLINE_EXPIRED_OR_UNACTIONABLE", item["reason_codes"])

    def test_egitim_cannot_participate(self):
        item = evaluate_item(
            source_id="egitim_x",
            category="egitim",
            can_participate_from_turkey=False,
        )
        self.assertEqual(item["item_decision"], "REJECT")

    def test_unknown_eligibility_is_not_no(self):
        item = evaluate_item(
            source_id="burs_x",
            category="burs",
            turkey_citizen_allowed="UNKNOWN",
            turkey_based_applicant_allowed="UNKNOWN",
        )
        self.assertEqual(item["item_decision"], "HOLD")
        self.assertIn("UNKNOWN_is_not_NO", item["warnings"])


class ConfigAndBibleLockTests(unittest.TestCase):
    def test_config_v4_tracks_and_spf(self):
        cfg = load_bible_config()
        self.assertEqual(cfg["bibleVersion"], BIBLE_VERSION)
        tracks = cfg["evaluation_tracks"]
        self.assertEqual(tracks["haber"], "ENGAGEMENT")
        self.assertEqual(tracks["research"], "ENGAGEMENT")
        self.assertEqual(tracks["duyuru"], "PRAGMATIC_UTILITY")
        self.assertEqual(tracks["burs"], "PRAGMATIC_UTILITY")
        self.assertEqual(tracks["egitim"], "PRAGMATIC_UTILITY")
        self.assertEqual(cfg["source_pass_fail"]["ruleset_version"], RULESET_VERSION)
        self.assertFalse(cfg["source_pass_fail"]["soft_score_can_fail"])
        a = cfg["score_a_haber_research"]["weights"]
        self.assertEqual(sum(a.values()), 100)
        b = cfg["score_b_pragmatic_utility"]["weights"]
        self.assertEqual(sum(b.values()), 100)
        self.assertGreater(b["turkey_audience_fit"], b.get("engagement_potential", 0))
        self.assertIn("health_drop", cfg["revalidation"]["event_triggers"])
        for t in revalidation_triggers():
            self.assertIn(t, cfg["revalidation"]["event_triggers"])

    def test_living_bible_is_v4(self):
        v4 = (CONTENT / "00_TURK_TIP_CONTENT_OS_BIBLE_v4.md").read_text(encoding="utf-8")
        self.assertIn("# TÜRK TIP İÇERİK OS — BIBLE v4", v4)
        self.assertIn("## KİTAP II — SOURCE PASS/FAIL & PIPELINE LOOP", v4)
        self.assertIn("SPF-28. Revalidation", v4)
        self.assertIn("evaluation_track", v4)
        stub = (CONTENT / "00_TURK_TIP_CONTENT_OS_BIBLE_v3.md").read_text(encoding="utf-8")
        self.assertIn("v4", stub.lower())
        self.assertNotIn("## BÖLÜM 0", stub)

    def test_vocab_and_policies_lock_v4(self):
        vocab = json.loads((CONTENT / "taxonomy" / "controlled-vocabulary.json").read_text(encoding="utf-8"))
        self.assertEqual(vocab["bibleVersion"], "4.0")
        self.assertEqual(tuple(vocab["evaluation_track"]), ("ENGAGEMENT", "PRAGMATIC_UTILITY"))
        self.assertEqual(tuple(vocab["editorial_decision"]), ("PASS", "CONDITIONAL", "WATCH", "FAIL"))
        files = {
            "haber": "ENGAGEMENT",
            "research": "ENGAGEMENT",
            "duyuru": "PRAGMATIC_UTILITY",
            "burs": "PRAGMATIC_UTILITY",
            "egitim": "PRAGMATIC_UTILITY",
        }
        paths = {
            "haber": CONTENT / "policies" / "haber-policy.json",
            "research": CONTENT / "policies" / "research-policy.json",
            "duyuru": CONTENT / "policies" / "tip-toplulugu-duyuru-policy.json",
            "burs": CONTENT / "policies" / "tip-toplulugu-burs-policy.json",
            "egitim": CONTENT / "policies" / "tip-toplulugu-egitim-policy.json",
        }
        for cat, path in paths.items():
            data = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(data["bibleVersion"], "4.0", cat)
            self.assertEqual(data["evaluation_track"], files[cat], cat)
            self.assertIs(data["auto_publish"], False, cat)


if __name__ == "__main__":
    unittest.main()
