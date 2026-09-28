"""Fail visibly when a runner_region=TR Hekimler source has stale or failing telemetry (no secrets needed)."""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone

HUB = os.environ.get("GCOS_HUB_URL", "https://global-content-os.channel-content-os-mcp.workers.dev")
TR_SOURCES = ("hsgm_public_health",)
QUOTA_MARKERS = ("d1_quota_exceeded", "row write limit", "free tier daily")


def evaluate(telemetry: dict | None, now: datetime, max_age_hours: float) -> list[str]:
    """Return human-readable problems for one source's telemetry row (empty list = fresh and healthy)."""
    if not telemetry or not telemetry.get("last_success_at"):
        return ["no successful run ever recorded"]
    problems = []
    last = datetime.fromisoformat(str(telemetry["last_success_at"]).replace("Z", "+00:00"))
    age = (now - last).total_seconds() / 3600
    if age > max_age_hours:
        problems.append(f"last success {age:.1f} h ago (limit {max_age_hours:g} h): {telemetry['last_success_at']}")
    if telemetry.get("source_health") not in (None, "HEALTHY"):
        problems.append(f"source_health={telemetry.get('source_health')} failure_count={telemetry.get('failure_count')}")
    reason = str(telemetry.get("coverage_reason") or "").lower()
    if any(m in reason for m in QUOTA_MARKERS):
        problems.append("D1 quota error recorded in telemetry")
    return problems


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-age-hours", type=float, default=48)
    args = ap.parse_args(argv)
    req = urllib.request.Request(HUB + "/api/hekimler/sources", headers={"User-Agent": "hekimler-tr-freshness/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        rows = {r["sourceId"]: r for r in json.load(resp)["sources"]}
    now = datetime.now(timezone.utc)
    bad = 0
    for sid in TR_SOURCES:
        problems = evaluate((rows.get(sid) or {}).get("telemetry"), now, args.max_age_hours)
        print(f"{sid}: {'OK' if not problems else 'STALE/FAILING'}")
        for p in problems:
            print(f"::error title=Hekimler TR source {sid}::{p}")
            bad += 1
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
