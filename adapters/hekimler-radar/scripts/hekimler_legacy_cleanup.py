"""Re-screen legacy Hekimler Hub items with the current audience + D9 date gates.

Reversible: rejected items are only marked decision_route='REJECTED_LEGACY' (no delete, no trash).
Usage:
  python scripts/hekimler_legacy_cleanup.py <backup.json> <report.json> [--sql out.sql]
"""
from __future__ import annotations

import html
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from radar.hekimler_dates import date_verdict, extract_page_date  # noqa: E402
from radar.hekimler_fetch import classify_with_congress_gate  # noqa: E402
from radar.hekimler_integrity import resolve_effective_registry  # noqa: E402
from radar.phase1_ingestion_canary import tls_verified_get  # noqa: E402

JUNK_TITLE = re.compile(r"^\S+@\S+\.\S+$|^(help|iletisim|contact|home|anasayfa)$", re.I)


def load_rows(path: str) -> list[dict]:
    t = Path(path).read_text(encoding="utf-8", errors="replace")
    return json.loads(t[t.index("["):])[0]["results"]


def screen(row: dict, profiles: dict[str, dict]) -> tuple[str, str]:
    title = html.unescape(row.get("title") or "").strip()
    url = row.get("canonical_url") or ""
    sid = row.get("source_id") or ""
    if not url.lower().startswith(("http://", "https://")):
        return "REJECT", "non_http_url"
    if JUNK_TITLE.match(title) or "@" in title or len(title) < 12:
        return "REJECT", "junk_title_or_contact"
    profile = profiles.get(sid)
    if profile is None:
        return "REJECT", "unknown_source"
    d = classify_with_congress_gate(profile, title=title, body=html.unescape(row.get("summary") or ""))
    if d.decision == "DISCARD":
        return "REJECT", f"gate:{d.reason[:60]}"
    pats = [re.compile(p) for p in profile.get("item_url_patterns") or []]
    if pats and not any(p.search(url) for p in pats):
        return "REJECT", "item_url_shape"
    # published_at on legacy rows is fetch time for undated items, so re-derive the date.
    v, dt = date_verdict(sid, published_at=None, title=title, url=url)
    if v == "UNDATED":
        host = (urlparse(url).hostname or "").lower()
        hosts = {h.lower() for h in (profile.get("fetch_plan") or {}).get("allowed_hostnames") or []}
        if host in hosts and (profile.get("fetch_plan") or {}).get("primary_method") != "eutilities_api":
            pd, _ = extract_page_date(tls_verified_get(url).body or "")
            if pd:
                v, dt = date_verdict(sid, published_at=pd.isoformat())
    if v == "STALE" and (profile.get("fetch_plan") or {}).get("primary_method") != "eutilities_api":
        return "REJECT", f"stale:{dt}"
    return "KEEP", v


def main() -> None:
    backup, report_path = sys.argv[1], sys.argv[2]
    sql_path = sys.argv[sys.argv.index("--sql") + 1] if "--sql" in sys.argv else None
    profiles = {s["source_id"]: s for s in resolve_effective_registry()["sources"]}
    rows = load_rows(backup)
    out = []
    for r in rows:
        verdict, why = screen(r, profiles)
        out.append({"id": r["id"], "source_id": r.get("source_id"), "title": (r.get("title") or "")[:90], "verdict": verdict, "why": why})
    Path(report_path).write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    keep = [o for o in out if o["verdict"] == "KEEP"]
    rej = [o for o in out if o["verdict"] == "REJECT"]
    print(f"total={len(out)} keep={len(keep)} reject={len(rej)}")
    if sql_path:
        ids = ",".join("'" + o["id"].replace("'", "''") + "'" for o in rej)
        stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        Path(sql_path).write_text(
            "UPDATE source_items SET decision_route = 'REJECTED_LEGACY', "
            f"updated_at = '{stamp}' WHERE channel_id = 'hekimler-toplulugu' AND triage_status = 'inbox' "
            f"AND id IN ({ids});\n",
            encoding="utf-8",
        )


if __name__ == "__main__":
    main()
