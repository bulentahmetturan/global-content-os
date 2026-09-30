"""Abroad Career Registry v1 — policy and merge fixtures."""
from __future__ import annotations

import unittest

from radar.tip_toplulugu_abroad_career import (
    classify_abroad_item,
    load_abroad_career_policy,
    load_abroad_career_registry,
)
from radar.tip_toplulugu_integrity import (
    DOMESTIC_OFFICIAL_PRIMARY_IDS,
    assert_unique_source_ids,
    tip_toplulugu_modules_queue_boundary_ok,
    resolve_effective_registry,
    tier_counts,
)
from radar.tip_toplulugu_registry import load_phase1_registry


class AbroadCareerRegistryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.abroad = load_abroad_career_registry()
        cls.policy = load_abroad_career_policy()
        cls.phase1 = load_phase1_registry()
        cls.effective = resolve_effective_registry()

    def test_three_layer_merge_deterministic(self):
        a = resolve_effective_registry()
        b = resolve_effective_registry()
        self.assertEqual(
            [s["source_id"] for s in a["sources"]],
            [s["source_id"] for s in b["sources"]],
        )
        self.assertIn("abroadCareerRegistry", a)
        self.assertTrue(any("Abroad Career" in x or "abroad" in x.lower() for x in a["loadMergeOrder"]))

    def test_phase1_fetch_plans_unchanged(self):
        for src in self.phase1["sources"]:
            sid = src["source_id"]
            eff = next(s for s in self.effective["sources"] if s["source_id"] == sid)
            self.assertEqual(eff.get("fetch_plan"), src.get("fetch_plan"))

    def test_no_source_collision(self):
        assert_unique_source_ids(self.effective)
        abroad_ids = {s["source_id"] for s in self.abroad["sources"]}
        domestic = {s["source_id"] for s in self.effective["sources"] if not s["source_id"].startswith("abroad_")}
        self.assertFalse(abroad_ids & domestic)

    def test_all_abroad_sources_official_primary_disabled(self):
        ready = set()
        for src in self.abroad["sources"]:
            self.assertEqual(src["source_tier"], "OFFICIAL_PRIMARY")
            self.assertIs(src["publication_eligible"], False)
            if (src.get("runtime_activation") or "") == "AUTOMATION_READY":
                ready.add(src["source_id"])
                self.assertTrue(src["fetch_enabled"])
                self.assertTrue(src["pipeline_wiring_enabled"])
            else:
                self.assertFalse(src["fetch_enabled"])
                self.assertFalse(src["scheduled_fetch_enabled"])
                self.assertFalse(src["candidate_emission_enabled"])
                self.assertFalse(src["pipeline_wiring_enabled"])
        self.assertTrue(
            {
                "abroad_ca_mcc_img_pathways",
                "abroad_it_salute_foreign_qual",
            }.issubset(ready)
        )
        # 2026-09-24 (S49): disabled for producing zero opportunity-shaped content (see
        # SORUN-TESPIT-LISTESI.md) -- must NOT be AUTOMATION_READY until a real surface is found.
        self.assertNotIn("abroad_ca_carms", ready)
        # 2026-09-24 (S50/S51): regularly produced content but none of it was ever scholarship/
        # education -- exam-administration logistics, webinars/newsletters, or local registration
        # admin only. Disabled; must NOT be AUTOMATION_READY.
        for sid in ("abroad_us_usmle", "abroad_us_nrmp", "abroad_ie_medical_council", "abroad_au_amc", "abroad_uk_oriel"):
            self.assertNotIn(sid, ready)

    def test_canada_requires_province(self):
        missing = classify_abroad_item(
            title="MCCQE eligibility update for IMGs",
            country="Canada",
            pathway_stage="exam_or_assessment",
            official_source_url="https://mcc.ca/credentials-and-services/pathways-to-licensure/pathways-for-international-medical-graduates/",
            jurisdiction=None,
        )
        self.assertEqual(missing.route, "NEEDS_REVIEW")
        ok = classify_abroad_item(
            title="MCCQE eligibility update for IMGs",
            country="Canada",
            pathway_stage="exam_or_assessment",
            official_source_url="https://mcc.ca/credentials-and-services/pathways-to-licensure/pathways-for-international-medical-graduates/",
            jurisdiction="Ontario",
        )
        self.assertEqual(ok.route, "ABROAD_CAREER")

    def test_germany_requires_land_when_relevant(self):
        d = classify_abroad_item(
            title="Approbation requirements update",
            country="Germany",
            pathway_stage="registration_or_licensure",
            official_source_url="https://www.anerkennung-in-deutschland.de/",
            jurisdiction=None,
        )
        self.assertEqual(d.route, "NEEDS_REVIEW")
        ok = classify_abroad_item(
            title="Approbation requirements update",
            country="Germany",
            pathway_stage="registration_or_licensure",
            official_source_url="https://www.anerkennung-in-deutschland.de/",
            jurisdiction="Bayern",
        )
        self.assertEqual(ok.route, "ABROAD_CAREER")

    def test_spain_italy_manual_review_flags(self):
        es = next(s for s in self.abroad["sources"] if s["source_id"] == "abroad_es_universidades_homologacion")
        it = next(s for s in self.abroad["sources"] if s["source_id"] == "abroad_it_salute_foreign_qual")
        self.assertTrue(es["manual_review_required"])
        self.assertTrue(it["manual_review_required"])
        mir = next(s for s in self.abroad["sources"] if s["source_id"] == "abroad_es_mir_fse")
        self.assertTrue(mir.get("intentionally_inactive"))

    def test_verified_pathway_update_accepted(self):
        d = classify_abroad_item(
            title="USMLE Step 2 CK fee and deadline change",
            country="United States",
            pathway_stage="exam_or_assessment",
            official_source_url="https://www.usmle.org/",
        )
        self.assertEqual(d.route, "ABROAD_CAREER")
        self.assertFalse(d.publication_eligible)

    def test_named_official_opportunity_accepted(self):
        d = classify_abroad_item(
            title="Official clinical observership for IMGs",
            country="United Kingdom",
            pathway_stage="official_research_or_clinical_training",
            official_source_url="https://www.gmc-uk.org/",
            opportunity_named=True,
            eligibility="GMC-eligible IMGs",
            deadline="2027-03-01",
        )
        self.assertEqual(d.route, "ABROAD_OPPORTUNITY_WATCH")

    def test_discard_admissions_rankings_recruiter_blog_immigration(self):
        cases = [
            "Apply to foreign medical school undergraduate admission",
            "Top university ranking for medicine 2026",
            "Hospital recruiter job agency placement abroad",
            "Influencer blog advice: easy pathway to Germany",
            "Immigration package and work visa agent for doctors",
        ]
        for title in cases:
            d = classify_abroad_item(
                title=title,
                country="Germany",
                pathway_stage="degree_recognition",
                official_source_url="https://example.org",
                jurisdiction="Berlin",
            )
            self.assertEqual(d.route, "DISCARD", title)

    def test_reject_automatic_diploma_claim(self):
        d = classify_abroad_item(
            title="Turkish diploma is automatically accepted in Spain",
            country="Spain",
            pathway_stage="degree_recognition",
            official_source_url="https://universidades.sede.gob.es/",
            jurisdiction="Madrid",
        )
        self.assertEqual(d.route, "DISCARD")

    def test_saudi_gulf_watch_only(self):
        d = classify_abroad_item(
            title="SCFHS licensing notice for specialists",
            country="Saudi Arabia",
            pathway_stage="registration_or_licensure",
            official_source_url="https://www.scfhs.org.sa/",
            watch_only_country=True,
        )
        self.assertEqual(d.route, "ABROAD_WATCH_ONLY")

    def test_no_fetcher_queue_scheduler_added(self):
        ok, reason = tip_toplulugu_modules_queue_boundary_ok()
        self.assertTrue(ok, reason)
        self.assertFalse(self.abroad["pipeline_wiring_enabled"])
        self.assertFalse(self.policy["auto_publish"])

    def test_tier_counts_after_abroad(self):
        counts = tier_counts(self.effective)
        domestic_op = {
            s["source_id"]
            for s in self.effective["sources"]
            if s["source_tier"] == "OFFICIAL_PRIMARY"
            and not s["source_id"].startswith("abroad_")
            and not s["source_id"].startswith("burs_")
            and not s["source_id"].startswith("egitim_")
        }
        self.assertEqual(domestic_op, set(DOMESTIC_OFFICIAL_PRIMARY_IDS))
        self.assertEqual(len(domestic_op), 12)
        abroad_op = [
            s for s in self.effective["sources"]
            if s["source_id"].startswith("abroad_") and s["source_tier"] == "OFFICIAL_PRIMARY"
        ]
        burs_op = [
            s for s in self.effective["sources"]
            if s["source_id"].startswith("burs_") and s["source_tier"] == "OFFICIAL_PRIMARY"
        ]
        self.assertEqual(len(abroad_op), 19)
        self.assertEqual(counts["OFFICIAL_PRIMARY"], 12 + 19 + len(burs_op))
        self.assertEqual(counts["PROFESSIONAL_BODY"], 5)  # + tdb_dental (tracked separately from the 46)
        self.assertEqual(counts["PROFESSIONAL_GUIDANCE"], 12)
        self.assertEqual(counts["SECONDARY_NEWSWIRE"], 32)  # +15 batch3 international English health/medical discovery pool


if __name__ == "__main__":
    unittest.main()
