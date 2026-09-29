#!/usr/bin/env python3
"""S66 -- canonical source identity / one-primary-heading invariant (2026-09-28).

Every canonical source (by normalized domain, unless a documented exception
applies) must map to exactly one primary heading: HABER, RESEARCH, DUYURU,
BURS, or EGITIM. This is a static check -- it reads config/feeds.json (the
Kaduse side) and the Hekimler effective registry (this repo's own Python
package), never live D1 -- so it can run in CI without production
credentials.

Known, explicitly-documented dual-heading exceptions (S57): a source CAN
legitimately produce content for two headings when it publishes genuinely
distinct content via distinct registered endpoints (Bible v4 SS2.2,
"source != content"). Each exception below names the two endpoints and why
they are not the same content stream. Anything not on this list that maps
to more than one heading is a hard failure -- Bible v4 SS2.1's "one primary
category per content stream" plus this session's stricter
canonical_source_key -> exactly one heading rule.

Usage: python3 check_source_identity.py [--json]
Exit 0 = no undocumented violations. Exit 1 = violation(s) found.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = ROOT.parents[1]

sys.path.insert(0, str(ROOT))

from radar.hekimler_activation import (  # noqa: E402
    ACTIVATION_AUTOMATION_READY,
    ACTIVATION_MANUAL_INTAKE,
    all_sources,
    compute_activation_state,
)
from radar.hekimler_integrity import resolve_effective_registry  # noqa: E402

# domain -> {heading: [(source_id_or_feed_id, endpoint, why)]}
# Only domains genuinely producing two DIFFERENT registered endpoints for
# two different headings belong here. See S57 in SORUN-TESPIT-LISTESI.md
# for the original per-domain reasoning.
DOCUMENTED_MULTI_HEADING_EXCEPTIONS = {
    "ecdc.europa.eu": (
        "General news (/en/news-events, HABER) vs. the weekly epidemiological "
        "threat-monitoring report (/en/publications-and-data/monitoring/"
        "weekly-threats-reports, DUYURU) -- genuinely distinct registered pages."
    ),
    "titck.gov.tr": (
        "General regulatory duyurular (HABER, news-titck-general-regulatory) vs. "
        "Hekimler's clinical-trials-specific /faaliyetalanlari/ilac/klinik-arastirmalar "
        "and /duyuru physician-facing announcement pages (DUYURU) -- distinct paths."
    ),
    "tuseb.gov.tr": (
        "Health-tech/AI innovation news (/tuyze, /haberler -- HABER) vs. Hekimler's "
        "homepage-scoped scholarship/research discovery registration (DUYURU) -- "
        "distinct registered pages, low but non-zero overlap risk (flagged in S57, "
        "not yet resolved to zero overlap)."
    ),
    "who.int": (
        "Global WHO newsroom API (/api/news/newsitems, HABER) vs. the WHO Turkey "
        "country office page (/turkiye, DUYURU) -- fully distinct endpoints."
    ),
    "eutils.ncbi.nlm.nih.gov": (
        "Kaduse ingests PubMed articles as standalone RESEARCH content "
        "(research-pubmed-eutilities). Hekimler's pubmed_biomedical_evidence is "
        "source_tier=EVIDENCE_INDEX -- it attaches evidence/citation verification "
        "to existing DUYURU/BURS/EGITIM items, it does not independently ingest "
        "PubMed articles as its own content stream. Verified in S57."
    ),
}

# BURS and EGITIM are two Bible-recognized, structurally distinct content
# categories (scholarship/grant vs. training/course) that commonly coexist
# for the same professional society by design -- e.g. eular.org runs both a
# fellowship program (burs_eular) and a training academy (egitim_eular).
# This is the SAME brand (Hekimler) intentionally maintaining two parallel
# streams, not cross-brand ownership ambiguity, so a domain whose heading
# set is exactly {BURS, EGITIM} (no HABER/RESEARCH/DUYURU mixed in) is
# allowed without a per-domain exception entry. Matches the existing
# test_hekimler_category_dedup.py::KEEP_ACTIVE precedent (burs_eular +
# egitim_eular both explicitly kept active there).
BURS_EGITIM_COEXISTENCE_ALLOWED = frozenset({"BURS", "EGITIM"})


def _domain(url: str | None) -> str | None:
    if not url:
        return None
    try:
        host = (urlparse(url).hostname or "").lower()
    except ValueError:
        return None
    if host.startswith("www."):
        host = host[4:]
    return host or None


def kaduse_domains() -> dict[str, list[tuple[str, str]]]:
    """domain -> [(feed_id, heading), ...] for ENABLED kaduse-news/kaduse-research feeds."""
    feeds = json.loads((REPO_ROOT / "config" / "feeds.json").read_text(encoding="utf-8"))["feeds"]
    out: dict[str, list[tuple[str, str]]] = {}
    for f in feeds:
        route = f.get("route")
        if route not in ("kaduse-news", "kaduse-research"):
            continue
        if not f.get("enabled"):
            continue
        dom = _domain(f.get("endpointUrl"))
        if not dom:
            continue
        heading = "HABER" if route == "kaduse-news" else "RESEARCH"
        out.setdefault(dom, []).append((f["id"], heading))
    return out


def hekimler_heading(source_id: str, profile: dict) -> str:
    sid = source_id or ""
    if sid.startswith("burs_"):
        return "BURS"
    if sid.startswith("egitim_"):
        return "EGITIM"
    return "DUYURU"


def hekimler_domains() -> dict[str, list[tuple[str, str]]]:
    """domain -> [(source_id, heading), ...] for non-retired/non-blocked Hekimler sources."""
    effective = resolve_effective_registry()
    out: dict[str, list[tuple[str, str]]] = {}
    for profile in all_sources(effective):
        state = compute_activation_state(profile)
        if state not in (ACTIVATION_AUTOMATION_READY, ACTIVATION_MANUAL_INTAKE):
            continue  # retired/blocked sources own no heading
        sid = profile.get("source_id") or ""
        url = profile.get("canonical_url") or profile.get("source_url") or profile.get("primary_url")
        dom = _domain(url)
        if not dom:
            continue
        heading = hekimler_heading(sid, profile)
        out.setdefault(dom, []).append((sid, heading))
    return out


def find_violations() -> list[dict]:
    kaduse = kaduse_domains()
    hekimler = hekimler_domains()
    all_domains = set(kaduse) | set(hekimler)
    violations = []
    for dom in sorted(all_domains):
        entries = kaduse.get(dom, []) + hekimler.get(dom, [])
        headings = sorted({h for _, h in entries})
        if len(headings) <= 1:
            continue
        if set(headings) == BURS_EGITIM_COEXISTENCE_ALLOWED:
            continue
        if dom in DOCUMENTED_MULTI_HEADING_EXCEPTIONS:
            continue
        violations.append(
            {
                "domain": dom,
                "headings": headings,
                "sources": [{"id": sid, "heading": h} for sid, h in entries],
            }
        )
    return violations


def main() -> int:
    as_json = "--json" in sys.argv
    violations = find_violations()
    if as_json:
        print(json.dumps({"violations": violations, "documented_exceptions": list(DOCUMENTED_MULTI_HEADING_EXCEPTIONS)}, indent=2, ensure_ascii=False))
    else:
        if not violations:
            print("OK: no canonical source maps to more than one primary heading (undocumented).")
            print(f"({len(DOCUMENTED_MULTI_HEADING_EXCEPTIONS)} documented dual-heading exceptions: {', '.join(sorted(DOCUMENTED_MULTI_HEADING_EXCEPTIONS))})")
        else:
            print(f"FAIL: {len(violations)} domain(s) map to more than one primary heading:")
            for v in violations:
                print(f"  {v['domain']}: {v['headings']}")
                for s in v["sources"]:
                    print(f"    - {s['id']} -> {s['heading']}")
    return 1 if violations else 0


if __name__ == "__main__":
    raise SystemExit(main())
