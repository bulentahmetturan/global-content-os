"""Helper to (re)wire an existing registry source to a verified official list URL.

Usage (from Python): ``from hekimler_wire_source import wire``.  It edits the JSON registry in place and
keeps the file's line endings.  Sources wired here default to ``execution: python_runner`` so heavy pages
stay out of the Workers Free CPU budget.
"""
from __future__ import annotations

import copy
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTENT = os.path.join(ROOT, "content")


def edit(fn: str, f) -> None:
    p = os.path.join(CONTENT, fn)
    raw = open(p, "rb").read().decode("utf8")
    crlf = "\r\n" in raw
    d = json.loads(raw)
    f(d)
    out = json.dumps(d, ensure_ascii=False, indent=2)
    if crlf:
        out = out.replace("\n", "\r\n")
    open(p, "wb").write(out.encode("utf8"))


def wire(fn, sid, url, hosts, paths, inc, exc, url_pats=None, title_pats=None, native=False,
         python=True, allow_congress=False, notes="", route="NEEDS_REVIEW", method="list-page", extra_plan=None):
    base = json.load(open(os.path.join(CONTENT, "source-registry-abroad-career-v1.json"), encoding="utf8"))["sources"]
    template = [x for x in base if x["source_id"] == "abroad_us_nrmp"][0]

    def f(d):
        x = [s for s in d["sources"] if s["source_id"] == sid][0]
        fp = copy.deepcopy(template["fetch_plan"])
        fp.update(allowed_hostnames=hosts, allowed_path_patterns=paths, forbidden_path_patterns=[], notes=notes, source_health="HEALTHY")
        fp["surfaces"] = [{"id": "list", "url": url, "role": "primary", "health": "HEALTHY"}]
        fp["coverage_policy"] = dict(fp["coverage_policy"], sparse_source_allowed=True, expected_eligible_frequency="rare")
        if extra_plan:
            fp.update(extra_plan)
        upd = dict(
            status="active", fetch_mode=method, source_url=url, canonical_url=url, primary_url=url,
            allowed_hostnames=hosts, allowed_path_patterns=paths, fetch_enabled=True, scheduled_fetch_enabled=True,
            candidate_emission_enabled=True, pipeline_wiring_enabled=True, publication_eligible=False,
            include_keywords=inc, exclude_keywords=exc, allowed_routes=template["allowed_routes"],
            default_route_on_accept=route, source_health="HEALTHY", runtime_activation="AUTOMATION_READY", fetch_plan=fp,
        )
        if url_pats:
            upd["item_url_patterns"] = url_pats
        if title_pats:
            upd["item_title_patterns"] = title_pats
        if python:
            upd["execution"] = "python_runner"
        if allow_congress:
            upd["allow_congress"] = True
        x.update(upd)
        for k in ("manual_review_reason", "manual_intake_reason"):
            x.pop(k, None)

    edit(fn, f)
    if native:
        p = os.path.join(CONTENT, "policies", "hekimler-audience-scope.json")
        pol = json.load(open(p, encoding="utf8"))
        if sid not in pol["audienceNativeSources"]:
            pol["audienceNativeSources"].append(sid)
        json.dump(pol, open(p, "w", encoding="utf8"), ensure_ascii=False, indent=2)
