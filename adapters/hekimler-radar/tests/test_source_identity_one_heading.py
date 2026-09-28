"""S66 -- every canonical source (by domain, unless a documented exception
applies) maps to exactly one primary heading (HABER/RESEARCH/DUYURU/BURS/
EGITIM). See scripts/check_source_identity.py for the full rule and the
list of documented dual-heading exceptions (S57's ecdc.europa.eu,
titck.gov.tr, tuseb.gov.tr, who.int, eutils.ncbi.nlm.nih.gov)."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import check_source_identity as csi  # noqa: E402


class SourceIdentityOneHeadingTests(unittest.TestCase):
    def test_no_undocumented_cross_heading_domain(self):
        violations = csi.find_violations()
        self.assertEqual(
            violations,
            [],
            "Found domain(s) mapped to more than one primary heading without a "
            "documented exception in DOCUMENTED_MULTI_HEADING_EXCEPTIONS: "
            + ", ".join(v["domain"] for v in violations),
        )

    def test_burs_egitim_coexistence_rule_only_allows_that_exact_pair(self):
        # Sanity: the allowlisted set must be exactly {BURS, EGITIM}, not a
        # superset that would accidentally also permit e.g. {BURS, EGITIM,
        # DUYURU} through.
        self.assertEqual(csi.BURS_EGITIM_COEXISTENCE_ALLOWED, frozenset({"BURS", "EGITIM"}))

    def test_documented_exceptions_all_have_a_reason(self):
        for domain, reason in csi.DOCUMENTED_MULTI_HEADING_EXCEPTIONS.items():
            self.assertTrue(reason and len(reason) > 20, f"{domain} needs a real reason, not a stub")

    def test_known_resolved_s57_domains_are_not_exceptions_anymore(self):
        # resmigazete.gov.tr and aa.com.tr were resolved to single ownership
        # in S57 -- they must NOT reappear in the exception list (that would
        # mean the structural fix regressed back to a keyword-only split).
        self.assertNotIn("resmigazete.gov.tr", csi.DOCUMENTED_MULTI_HEADING_EXCEPTIONS)
        self.assertNotIn("aa.com.tr", csi.DOCUMENTED_MULTI_HEADING_EXCEPTIONS)


if __name__ == "__main__":
    unittest.main()
