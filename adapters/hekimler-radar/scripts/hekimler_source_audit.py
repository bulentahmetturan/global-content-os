"""Real-fetch audit of AUTOMATION_READY Hekimler sources (no Hub writes).

Usage: python scripts/hekimler_source_audit.py [source_id ...]
Writes content/PIPELINE-STATUS-46.json (per-source evidence).
"""
from __future__ import annotations

import html
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from radar.hekimler_activation import all_sources, compute_activation_state  # noqa: E402
from radar.hekimler_dates import date_verdict, extract_page_date  # noqa: E402
from radar.hekimler_fetch import classify_with_congress_gate  # noqa: E402
from radar.hekimler_integrity import resolve_effective_registry  # noqa: E402
from radar.phase1_ingestion_canary import (  # noqa: E402
    parse_raw_items,
    resolve_canary_listing_url,
    tls_verified_get,
)

OUT = ROOT / "content" / "PIPELINE-STATUS-46.json"


def clean(t: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(t or "")).strip()


def audit(profile: dict) -> dict:
    sid = profile["source_id"]
    url = resolve_canary_listing_url(profile)
    res = tls_verified_get(url)
    row = {"source_id": sid, "url": url, "http": res.http_status, "failure": res.failure_reason}
    if not res.body:
        row["result"] = "FAILED"
        return row
    items = parse_raw_items(
        source_id=sid, source_url=url, body=res.body, fetch_method="list-page",
        fetched_at=datetime.now(timezone.utc).isoformat(),
    )
    url_pats = [re.compile(p) for p in profile.get("item_url_patterns") or []]
    title_pats = [re.compile(p) for p in profile.get("item_title_patterns") or []]
    seen, accepted = set(), []
    for it in items:
        if url_pats and not any(p.search(it.canonical_item_url or "") for p in url_pats):
            continue
        if title_pats and not any(p.search((it.title or "").strip()) for p in title_pats):
            continue
        d = classify_with_congress_gate(profile, title=it.title, body=it.raw_excerpt or "")
        if d.decision == "DISCARD":
            continue
        key = (it.canonical_item_url, clean(it.title))
        if key in seen:
            continue
        seen.add(key)
        accepted.append(it)
    verdicts = {"FRESH": [], "ACTIVE": [], "UNDATED": [], "STALE": []}
    budget = 40
    hosts = {h.lower() for h in (profile.get("fetch_plan") or {}).get("allowed_hostnames") or []}
    exempt = (profile.get("fetch_plan") or {}).get("primary_method") == "eutilities_api"
    for i in accepted:
        v, d = date_verdict(sid, published_at=i.published_at, title=clean(i.title), excerpt=clean(i.raw_excerpt or ""), url=i.canonical_item_url or "")
        if v == "UNDATED" and not exempt and budget > 0 and (re.match(r"https?://([^/]+)", i.canonical_item_url or "") or [None, ""])[1].lower() in hosts:
            budget -= 1
            pd, _m = extract_page_date(tls_verified_get(i.canonical_item_url).body or "")
            if pd:
                v, d = date_verdict(sid, published_at=pd.isoformat())
        verdicts[v].append((i, d))
    kept = verdicts["FRESH"] + verdicts["ACTIVE"]
    row["parsed"] = len(items)
    row["accepted_pre_date"] = len(accepted)
    row["fresh"] = len(verdicts["FRESH"])
    row["active"] = len(verdicts["ACTIVE"])
    row["undated"] = len(verdicts["UNDATED"])
    row["stale"] = len(verdicts["STALE"])
    row["accepted"] = len(kept) + len(verdicts["UNDATED"])
    row["sample"] = [
        {"title": clean(i.title)[:110], "url": i.canonical_item_url, "date": str(d) if d else None}
        for i, d in sorted(kept, key=lambda x: x[1], reverse=True)[:3]
    ]
    row["undated_sample"] = [clean(i.title)[:90] for i, _ in verdicts["UNDATED"][:3]]
    row["result"] = "HAS_CANDIDATES" if row["accepted"] else "NO_CANDIDATES"
    return row


def main() -> None:
    want = set(sys.argv[1:])
    eff = resolve_effective_registry()
    rows = []
    for p in all_sources(eff):
        if compute_activation_state(p) != "AUTOMATION_READY":
            continue
        if want and p["source_id"] not in want:
            continue
        for attempt in (1, 2):
            try:
                rows.append(audit(p))
                break
            except Exception as exc:  # transient network errors get one retry
                if attempt == 2:
                    rows.append({"source_id": p["source_id"], "result": "FAILED", "failure": repr(exc)[:160]})
    # Merge into the existing evidence file (keyed by source_id) so partial re-runs never erase other rows.
    existing = {}
    if OUT.exists():
        try:
            existing = {r["source_id"]: r for r in json.loads(OUT.read_text(encoding="utf-8"))}
        except (ValueError, KeyError):
            existing = {}
    for r in rows:
        existing[r["source_id"]] = r
    OUT.write_text(json.dumps(list(existing.values()), ensure_ascii=False, indent=2), encoding="utf-8")
    for r in rows:
        print(f"{r['source_id'][:34]:34} {r.get('result'):14} http={r.get('http')} parsed={r.get('parsed')} pre={r.get('accepted_pre_date')} fresh={r.get('fresh')} active={r.get('active')} undated={r.get('undated')} stale={r.get('stale')}")


if __name__ == "__main__":
    main()
