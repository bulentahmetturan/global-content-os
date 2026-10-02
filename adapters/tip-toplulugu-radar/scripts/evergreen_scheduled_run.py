"""EVERGREEN path executor entry point (see radar/evergreen_runner.py).

  python scripts/evergreen_scheduled_run.py --plan-file plan.json [--only id,id] [--out report.json]      (local, dry run)
  python scripts/evergreen_scheduled_run.py --hub https://<hub> [--only id,id]                            (remote plan, dry run)
  python scripts/evergreen_scheduled_run.py --hub https://<hub> --write                                   (explicit write opt-in)

There is no default hub: a plan source must be named. Nothing is posted without --write; --write also needs --hub and
TIP_RADAR_INGEST_TOKEN in the environment (sent only as a header, never printed).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from radar.evergreen_runner import hub_get_plan, run  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--plan-file", help="local plan JSON (built by scripts/evergreen-canary.mjs from the canonical registry)")
    ap.add_argument("--hub", help="explicit Hub URL to read the plan from (and to write to with --write)")
    ap.add_argument("--only", default="", help="comma-separated source ids")
    ap.add_argument("--write", action="store_true", help="explicit opt-in: post candidates for plan sources marked write_allowed")
    ap.add_argument("--out", help="also write the JSON report to this file")
    args = ap.parse_args(argv)
    if bool(args.plan_file) == bool(args.hub):
        print("exactly one plan source is required: --plan-file or --hub", file=sys.stderr)
        return 2
    if args.write and not args.hub:
        print("--write needs --hub", file=sys.stderr)
        return 2
    token = os.environ.get("TIP_RADAR_INGEST_TOKEN") if args.write else None
    if args.write and not token:
        print("--write needs TIP_RADAR_INGEST_TOKEN", file=sys.stderr)
        return 2
    plan = json.loads(Path(args.plan_file).read_text(encoding="utf-8")) if args.plan_file else hub_get_plan(args.hub)
    only = [x.strip() for x in args.only.split(",") if x.strip()] or None
    code, doc = run(plan, only=only, write=args.write, hub=args.hub, token=token, now=datetime.now(timezone.utc))
    if args.out:
        Path(args.out).write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
    return code


if __name__ == "__main__":
    raise SystemExit(main())
