"""Python <-> Worker(TypeScript) parity on one shared fixture set (product rules, not echoes)."""
import json
import shutil
import subprocess
import unittest
from datetime import date
from pathlib import Path

from radar.tip_toplulugu_activation import all_sources
from radar.tip_toplulugu_dates import date_verdict
from radar.tip_toplulugu_fetch import classify_with_congress_gate
from radar.tip_toplulugu_integrity import resolve_effective_registry

FIX = Path(__file__).resolve().parent / "fixtures" / "tip_toplulugu_parity.json"
# adapters/tip-toplulugu-radar/tests → global-content-os repo root
HUB = Path(__file__).resolve().parents[3]


def python_decision(profile, case, today):
    d = classify_with_congress_gate(profile, title=case["title"], body="")
    if d.decision == "DISCARD":
        return "DISCARD"
    v, _ = date_verdict(case["source_id"], published_at=case.get("published_at"), title=case["title"], url=case.get("url", ""), today=today)
    return "DISCARD" if v == "STALE" else "ACCEPT"


class WorkerParityTests(unittest.TestCase):
    def test_product_expectations_hold_in_python(self):
        fx = json.loads(FIX.read_text(encoding="utf-8"))
        today = date.fromisoformat(fx["today"])
        eff = {s["source_id"]: s for s in all_sources(resolve_effective_registry())}
        for c in fx["cases"]:
            self.assertEqual(python_decision(eff[c["source_id"]], c, today), c["expect"], c["id"])

    @unittest.skipUnless(shutil.which("node") and (HUB / "node_modules" / "esbuild").exists(), "node/esbuild not available")
    def test_worker_typescript_matches_python(self):
        fx = json.loads(FIX.read_text(encoding="utf-8"))
        today = date.fromisoformat(fx["today"])
        eff = {s["source_id"]: s for s in all_sources(resolve_effective_registry())}
        import os
        import tempfile

        from radar.tip_toplulugu_continuous_runner import export_automation_ready_profiles

        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as fh:
            json.dump({"profiles": export_automation_ready_profiles()}, fh, ensure_ascii=False)
        proc = subprocess.run(
            ["node", "scripts/tip-toplulugu-parity.mjs", str(FIX)],
            cwd=HUB, capture_output=True, text=True, encoding="utf-8", timeout=120,
            env={**os.environ, "TIP_TOPLULUGU_PARITY_PROFILES": fh.name},
        )
        self.assertEqual(proc.returncode, 0, proc.stderr[-800:])
        worker = {r["id"]: r for r in json.loads(proc.stdout.strip().splitlines()[-1])}
        for c in fx["cases"]:
            py = python_decision(eff[c["source_id"]], c, today)
            self.assertEqual(worker[c["id"]]["decision"], py, f"{c['id']}: worker={worker[c['id']]} python={py}")
            # date decision parity as well (FRESH/ACTIVE/UNDATED/STALE) whenever the keyword gate accepted the title
            if py != "DISCARD" or worker[c["id"]].get("date_verdict"):
                pv, _ = date_verdict(c["source_id"], published_at=c.get("published_at"), title=c["title"], url=c.get("url", ""), today=today)
                self.assertEqual(worker[c["id"]].get("date_verdict"), pv, f"{c['id']}: date verdict")
            # rejection category parity (include/exclude/audience/stale) between the two engines
            d = classify_with_congress_gate(eff[c["source_id"]], title=c["title"], body="")
            if d.decision == "DISCARD":
                wr = worker[c["id"]]["reason"]
                def cat(r):
                    r = (r or "").lower()
                    for key in ("exclude", "no include", "out_of_audience", "congress", "stale"):
                        if r.startswith(key):
                            return key
                    return r.split(":")[0]

                self.assertEqual(cat(wr), cat(d.reason), f"{c['id']}: reason python={d.reason} worker={wr}")


if __name__ == "__main__":
    unittest.main()


class WorkerParseParityTests(unittest.TestCase):
    """Worker parseHtmlAnchors must agree with Python parse_raw_items on the shared fixtures."""

    @unittest.skipUnless(shutil.which("node") and (HUB / "node_modules" / "esbuild").exists(), "node/esbuild not available")
    def test_worker_parse_matches_python_parse(self):
        from radar.phase1_ingestion_canary import parse_raw_items

        fixtures = FIX.parent
        proc = subprocess.run(
            ["node", "scripts/tip-toplulugu-parse-parity.mjs", str(fixtures)],
            cwd=HUB, capture_output=True, text=True, encoding="utf-8", timeout=120,
        )
        self.assertEqual(proc.returncode, 0, proc.stderr[-800:])
        worker = json.loads(proc.stdout.strip().splitlines()[-1])
        self.assertTrue(worker)
        for name, w_items in worker.items():
            body = (fixtures / name).read_text(encoding="utf-8")
            py = parse_raw_items(source_id="x", source_url="https://example.org/list", body=body, fetch_method="list-page", fetched_at="t")
            # Intentional stage difference (documented): the Python runner normalises titles (unescape, whitespace,
            # leading-date split) in ingest, right after parsing; the Worker's parser normalises while parsing but keeps
            # a leading date in the title. Compare both AFTER the Python normalisation so the final title/url/date agree.
            from radar.phase1_ingestion_canary import _clean_title

            def norm(title, published):
                clean, lead = _clean_title(title)
                return clean, published or lead

            py_items = [norm(i.title, i.published_at)[:1] + (i.canonical_item_url,) + norm(i.title, i.published_at)[1:] for i in py]
            w_pairs = [norm(i["title"], i["published_at"])[:1] + (i["url"],) + norm(i["title"], i["published_at"])[1:] for i in w_items]
            self.assertEqual(w_pairs, py_items, name)


class WorkerListingAllowlistTests(unittest.TestCase):
    """The Worker's own host/path allowlist must accept every ready source's listing URL."""

    @unittest.skipUnless(shutil.which("node") and (HUB / "node_modules" / "esbuild").exists(), "node/esbuild not available")
    def test_every_ready_profile_listing_passes_worker_allowlist(self):
        import os
        import tempfile

        from radar.tip_toplulugu_continuous_runner import export_automation_ready_profiles

        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as fh:
            json.dump({"profiles": export_automation_ready_profiles()}, fh, ensure_ascii=False)
        proc = subprocess.run(
            ["node", "scripts/tip-toplulugu-listing-check.mjs"],
            cwd=HUB, capture_output=True, text=True, encoding="utf-8", timeout=120,
            env={**os.environ, "TIP_TOPLULUGU_PARITY_PROFILES": fh.name},
        )
        self.assertEqual(proc.returncode, 0, proc.stderr[-800:])
        rows = json.loads(proc.stdout.strip().splitlines()[-1])
        self.assertGreater(len(rows), 30)
        blocked = [(r["source_id"], r["listing"]) for r in rows if not r["allowed"]]
        self.assertEqual(blocked, [])
