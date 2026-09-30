"""Fail visibly when a runner_region=TR Tıp Topluluğu source has stale or failing telemetry (no secrets needed)."""
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


NOT_PROVISIONED = (
    "TR runner not provisioned (repo variable TR_RUNNER_ENABLED != true, no self-hosted `tr` runner): "
    "{sources} are not collected at all. Known external blocker, reported daily as DIŞ by the issue check (S08); "
    "freshness is enforced once the runner exists. Setup: adapters/tip-toplulugu-radar/scripts/tip_toplulugu_tr_runner_setup.md"
)


def runner_enabled(env: dict | None = None) -> bool:
    """Same switch that gates the scheduled TR runner job (.github/workflows/tip-toplulugu-tr-runner.yml)."""
    return str((env if env is not None else os.environ).get("TR_RUNNER_ENABLED") or "").strip().lower() == "true"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-age-hours", type=float, default=48)
    args = ap.parse_args(argv)
    if not runner_enabled():
        msg = NOT_PROVISIONED.format(sources=", ".join(TR_SOURCES))
        print(f"::notice title=Tıp Topluluğu TR sources not collected::{msg}")
        summary = os.environ.get("GITHUB_STEP_SUMMARY")
        if summary:
            with open(summary, "a", encoding="utf-8") as fh:
                fh.write(f"## Tıp Topluluğu TR source freshness\n\n**NOT MEASURED** - {msg}\n")
        return 0
    req = urllib.request.Request(HUB + "/api/tip_toplulugu/sources", headers={"User-Agent": "tip-toplulugu-tr-freshness/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        rows = {r["sourceId"]: r for r in json.load(resp)["sources"]}
    now = datetime.now(timezone.utc)
    bad = 0
    for sid in TR_SOURCES:
        problems = evaluate((rows.get(sid) or {}).get("telemetry"), now, args.max_age_hours)
        print(f"{sid}: {'OK' if not problems else 'STALE/FAILING'}")
        for p in problems:
            print(f"::error title=Tıp Topluluğu TR source {sid}::{p}")
            bad += 1
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
