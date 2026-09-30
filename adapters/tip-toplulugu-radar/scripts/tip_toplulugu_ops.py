"""Operator CLI for the Tıp Topluluğu scheduler (read-only; never activates, mutates config or writes to the Hub).

  python scripts/tip_toplulugu_ops.py status   [--hub-url URL | --telemetry-file F] [--json]
  python scripts/tip_toplulugu_ops.py capacity [--history DIR_OR_FILE ...] [--pending-manual | --add N --add-cadence MIN]

`status`   -> per-source scheduling state (due / backoff / manual-review / lateness) computed by the same
              radar.tip_toplulugu_scheduler code the runner uses; only exceptional sources are listed.
`capacity` -> SAFE / CAUTION / BLOCK answer to "can another batch be activated?". Exit code 0 SAFE, 1 CAUTION,
              2 BLOCK. Activation itself stays a controlled, human-reviewed commit.
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
sys.path.insert(0, str(ROOT / "scripts"))

from radar.tip_toplulugu_scheduler import Policy, SourceState, assess_capacity, plan_run, source_status  # noqa: E402

EXIT = {"SAFE": 0, "CAUTION": 1, "BLOCK": 2}


def _registry():
    os.environ.setdefault("TIP_TOPLULUGU_CONTINUOUS_INGESTION_ENABLED", "true")
    from radar.tip_toplulugu_activation import (
        ACTIVATION_AUTOMATION_READY,
        ACTIVATION_MANUAL_INTAKE,
        all_sources,
        check_interval_minutes,
        compute_activation_state,
    )
    from radar.tip_toplulugu_integrity import resolve_effective_registry

    srcs = all_sources(resolve_effective_registry())
    ready = [s for s in srcs if compute_activation_state(s) == ACTIVATION_AUTOMATION_READY and not s.get("runner_region")]
    manual = [s for s in srcs if compute_activation_state(s) == ACTIVATION_MANUAL_INTAKE]
    return ready, manual, check_interval_minutes


def _telemetry(args) -> dict:
    if args.telemetry_file:
        data = json.loads(Path(args.telemetry_file).read_text(encoding="utf-8"))
        return {r["sourceId"]: r.get("telemetry") or {} for r in data.get("sources", [])}
    import tip_toplulugu_scheduled_run as run

    return run.fetch_hub_telemetry(args.hub_url or os.environ.get("GCOS_HUB_URL") or "http://127.0.0.1:8787")


def _history(paths: list[str]) -> list[dict]:
    files: list[Path] = []
    for p in paths:
        pp = Path(p)
        files += sorted(pp.rglob("run-report.json")) if pp.is_dir() else [pp]
    cycles = []
    for f in files:
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if data.get("dry_run"):
            continue
        cycle = dict(data.get("cycle") or {})
        cycle.setdefault("sources_capacity_delayed", (data.get("scheduler") or {}).get("capacity_delayed") and len(data["scheduler"]["capacity_delayed"]) or 0)
        cycles.append(cycle)
    cycles.sort(key=lambda c: c.get("started_at") or "")
    return cycles


def cmd_status(args) -> int:
    ready, _, interval = _registry()
    tel = _telemetry(args)
    pol = Policy()
    now = datetime.now(timezone.utc)
    states = [
        SourceState(s["source_id"], interval(s), (tel.get(s["source_id"]) or {}).get("last_success_at"),
                    (tel.get(s["source_id"]) or {}).get("last_run_at"), int((tel.get(s["source_id"]) or {}).get("failure_count") or 0))
        for s in ready
    ]
    plan = plan_run(states, now, pol)
    recs = {r["source_id"]: r for r in (source_status(st, now, pol) for st in states)}
    late = [r for r in recs.values() if (r["lateness_min"] or 0) > pol.lateness_attention_min]
    out = {
        "active_sources": len(states), "due_now": len(plan.queue), "in_backoff": plan.backoff,
        "manual_review": plan.manual_review, "not_due": len(plan.not_due),
        "max_lateness_min": plan.max_lateness_min, "attention_late": [r["source_id"] for r in late],
        "telemetry_available": bool(tel),
    }
    if args.json:
        out["sources"] = list(recs.values())
    print(json.dumps(out, indent=1 if args.json else None, ensure_ascii=False))
    return 1 if (late or plan.manual_review) else 0


def cmd_capacity(args) -> int:
    ready, manual, interval = _registry()
    cads = [interval(s) for s in ready]
    adds: list[int] = []
    if args.pending_manual:
        adds += [interval(s) for s in manual]
    adds += [args.add_cadence] * args.add
    res = assess_capacity(cads, _history(args.history), Policy(), additional_cadences_min=adds)
    res["bulk_backlog_activation"] = "NO"  # this command only answers; it never activates anything
    print(json.dumps(res, indent=1, ensure_ascii=False))
    return EXIT[res["status"]]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    st = sub.add_parser("status")
    st.add_argument("--hub-url")
    st.add_argument("--telemetry-file")
    st.add_argument("--json", action="store_true")
    cp = sub.add_parser("capacity")
    cp.add_argument("--history", nargs="*", default=[])
    cp.add_argument("--pending-manual", action="store_true", help="include every MANUAL_INTAKE source at its own cadence")
    cp.add_argument("--add", type=int, default=0)
    cp.add_argument("--add-cadence", type=int, default=10080)
    args = ap.parse_args()
    return cmd_status(args) if args.cmd == "status" else cmd_capacity(args)


if __name__ == "__main__":
    raise SystemExit(main())
