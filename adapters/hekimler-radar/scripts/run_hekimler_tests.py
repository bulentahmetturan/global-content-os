#!/usr/bin/env python3
"""Canonical Hekimler-related unit suite for tip-ogrencileri-platformu.

Includes:
  - tests/test_hekimler*.py
  - tests/test_phase1_ingestion_canary.py

Usage (from adapters/hekimler-radar):
  python scripts/run_hekimler_tests.py
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_suite() -> unittest.TestSuite:
    loader = unittest.defaultTestLoader
    suite = unittest.TestSuite()
    suite.addTests(loader.discover(str(ROOT / "tests"), pattern="test_hekimler*.py"))
    suite.addTests(loader.loadTestsFromName("tests.test_phase1_ingestion_canary"))
    return suite


def main() -> int:
    sys.path.insert(0, str(ROOT))
    suite = load_suite()
    print(f"Canonical Hekimler-related tests: {suite.countTestCases()}")
    result = unittest.TextTestRunner(verbosity=1).run(suite)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
