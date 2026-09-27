"""Scheduled Hekimler Python source runner (GitHub Actions entry point).

* one subprocess per source (hard per-source timeout, failure isolation);
* bounded retry with exponential backoff for transient fetch/network failures only;
* writes a non-secret JSON + Markdown report and appends the table to the GitHub job summary;
* exit code is 1 when ANY source failed (partial failure turns the workflow red; the report/summary/artifact are
  written first, and upload steps run with if: always()); 2 when the ingest token is missing.

Usage:
  python scripts/hekimler_scheduled_run.py --sources all-python|all|tr-runner|id1,id2 [--timeout 240] [--retries 2]
                                            [--report-dir report] [--dry-run]
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

QUOTA_MARKERS = ("d1_quota_exceeded", "row write limit", "free tier daily")


def is_quota_error(text: object) -> bool:
    t = str(text or "").lower()
    return any(m in t for m in QUOTA_MARKERS)


TRANSIENT_MARKERS = ("timed out", "timeout", "temporarily", "connection", "reset", "502", "503", "504", "429", "degraded")


def fetch_hub_telemetry(hub_url: str, timeout: float = 20.0) -> dict[str, dict]:
    """GET /api/hekimler/sources from the Hub, keyed by source_id -> telemetry row.

    The GitHub Actions runner is a fresh VM every day with no local memory of past
    runs, so interval-aware due-filtering (`is_due_for_fetch`) needs this read-back
    from the Hub's persisted telemetry -- otherwise every source looks "never
    fetched" and is always due, which defeats the whole point of the interval.
    Also carries zero_accept_streak/source_health so the runner can raise the
    "source went quiet" warning using the same counter the Hub already maintains.
    On any failure, returns {} (caller treats every source as due, same as before
    this existed) rather than blocking the run.
    """
    url = hub_url.rstrip("/") + "/api/hekimler/sources"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "hekimler-scheduled-run/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as exc:  # noqa: BLE001 — telemetry read-back must never block the run
        print(f"::warning::could not read telemetry from Hub ({exc}); treating all sources as due")
        return {}
    out: dict[str, dict] = {}
    for row in data.get("sources") or []:
        sid = row.get("sourceId")
        if not sid:
            continue
        out[sid] = row.get("telemetry") or {}
    return out


ZERO_ACCEPT_STREAK_WARN_THRESHOLD = 6  # consecutive empty-eligible runs before flagging as possibly broken


def select_sources(spec: str, *, force_due: bool = False, hub_url: str | None = None) -> list[str]:
    os.environ.setdefault("HEKIMLER_CONTINUOUS_INGESTION_ENABLED", "true")
    from radar.hekimler_activation import (
        ACTIVATION_AUTOMATION_READY,
        all_sources,
        compute_activation_state,
        is_due_for_fetch,
    )
    from radar.hekimler_integrity import resolve_effective_registry

    ready = [
        s for s in all_sources(resolve_effective_registry())
        if compute_activation_state(s) == ACTIVATION_AUTOMATION_READY
    ]
    # Sources tagged runner_region=TR only work from a Turkish network; the GitHub-hosted runner skips them and an
    # operator-run job selects them with --sources tr-runner (same adapter, same authenticated ingest contract).
    hosted = [s for s in ready if not s.get("runner_region")]

    def apply_due_filter(candidates: list[dict]) -> list[str]:
        ids = [s["source_id"] for s in candidates]
        if force_due:
            return ids
        telemetry = fetch_hub_telemetry(hub_url or os.environ.get("GCOS_HUB_URL") or "http://127.0.0.1:8787")
        last_success = {sid: row.get("last_success_at") for sid, row in telemetry.items()}
        due = [s for s in candidates if is_due_for_fetch(s, last_success_at=last_success.get(s["source_id"]))]
        skipped = [s["source_id"] for s in candidates if s["source_id"] not in {d["source_id"] for d in due}]
        if skipped:
            print(f"::notice::skipping {len(skipped)} source(s) not yet due (interval not elapsed): {', '.join(skipped)}")
        return [s["source_id"] for s in due]

    if spec == "all":
        return apply_due_filter(hosted)
    if spec == "all-python":
        return apply_due_filter([s for s in hosted if s.get("execution") == "python_runner"])
    if spec == "tr-runner":
        return apply_due_filter([s for s in ready if s.get("runner_region") == "TR"])
    # Explicit --sources id1,id2 is an operator override: run it now regardless of interval.
    wanted = [x.strip() for x in spec.split(",") if x.strip()]
    known = {s["source_id"] for s in ready}
    unknown = [w for w in wanted if w not in known]
    if unknown:
        print(f"::warning::not AUTOMATION_READY / unknown: {', '.join(unknown)}")
    return [w for w in wanted if w in known]


def run_once(source_id: str, timeout: int, dry_run: bool) -> tuple[dict | None, str]:
    cmd = [sys.executable, str(ROOT / "scripts" / "hekimler_run_one.py"), source_id]
    if dry_run:
        cmd.append("--dry-run")
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, cwd=str(ROOT))
    except subprocess.TimeoutExpired:
        return None, f"source timeout after {timeout}s"
    text = (proc.stdout or "") + "\n" + (proc.stderr or "")
    for line in (proc.stdout or "").splitlines():
        if line.startswith("RESULT_JSON "):
            return json.loads(line[len("RESULT_JSON "):]), ""
    tail = " | ".join(x for x in text.strip().splitlines()[-4:])[:400]
    return None, f"exit {proc.returncode}: {tail}"


def run_source(source_id: str, timeout: int, retries: int, dry_run: bool) -> dict:
    attempts = 0
    last_err = ""
    row: dict = {"source_id": source_id}
    while attempts <= retries:
        attempts += 1
        data, err = run_once(source_id, timeout, dry_run)
        if data and data.get("results"):
            r = data["results"][0]
            row.update(
                operator_status=r.get("operator_status"),
                fetch_result=r.get("fetch_result"),
                parsed=r.get("item_count", 0),
                rejected_date=r.get("rejected_date", 0),
                rejected_audience=r.get("rejected_audience", 0),
                rejected_keyword=r.get("rejected_keyword", 0),
                rejected_shape=r.get("rejected_shape", 0),
                eligible=r.get("accepted_count", 0) + r.get("duplicate_count", 0),
                new_rows=r.get("accepted_count", 0),
                duplicates=r.get("duplicate_count", 0),
                hub_failures=r.get("hub_delivery_failures", 0),
                newest_record_date=r.get("newest_record_date"),
                error=r.get("error_reason"),
                seconds=data.get("seconds"),
            )
            transient = row["fetch_result"] not in ("ok", "no_change") and any(
                m in str(row.get("error") or row.get("operator_status") or "").lower() for m in TRANSIENT_MARKERS
            )
            if not transient and not row["hub_failures"]:
                break
            last_err = str(row.get("error") or row.get("operator_status"))
            if is_quota_error(last_err):
                # Retrying only burns more of the exhausted quota; surface it and stop retrying this source.
                row["d1_quota"] = True
                row["error"] = "D1_QUOTA_EXCEEDED: " + str(last_err)[:200]
                break
        else:
            last_err = err
            row.update(operator_status="run_failed", error=err)
            if not any(m in err.lower() for m in TRANSIENT_MARKERS) and "exit" not in err.lower():
                break
        if attempts <= retries:
            time.sleep(min(60, 5 * 2 ** (attempts - 1)))
    row["attempts"] = attempts
    row["ok"] = bool(row.get("fetch_result") in ("ok", "no_change") and not row.get("hub_failures"))
    if not row["ok"] and not row.get("error"):
        row["error"] = last_err
    return row


def markdown(rows: list[dict]) -> str:
    head = (
        "| Source | Status | Parsed | Date rej. | Audience rej. | Keyword rej. | Shape rej. | Eligible | New rows | Dup | Newest record | OK | Note |\n"
        "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|\n"
    )
    body = ""
    for r in rows:
        body += (
            f"| `{r['source_id']}` | {r.get('operator_status')} | {r.get('parsed', 0)} | {r.get('rejected_date', 0)} | "
            f"{r.get('rejected_audience', 0)} | {r.get('rejected_keyword', 0)} | {r.get('rejected_shape', 0)} | "
            f"{r.get('eligible', 0)} | {r.get('new_rows', 0)} | {r.get('duplicates', 0)} | {r.get('newest_record_date') or ''} | "
            f"{'yes' if r.get('ok') else 'NO'} | {str(r.get('error') or '')[:90].replace('|', '/')} |\n"
        )
    return head + body


def quota_banner(rows: list[dict]) -> str:
    hit = [r["source_id"] for r in rows if r.get("d1_quota")]
    if not hit:
        return ""
    return (
        "> **D1 DAILY WRITE QUOTA EXCEEDED** - Cloudflare D1 (Free plan) rejected writes. "
        f"Affected sources: {', '.join(hit)}. Nothing was ingested for them; ingestion resumes after 00:00 UTC "
        "or on a paid plan. This run is intentionally red.\n\n"
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sources", default="all-python")
    ap.add_argument("--timeout", type=int, default=240)
    ap.add_argument("--retries", type=int, default=2)
    ap.add_argument("--report-dir", default="report")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument(
        "--force-due",
        action="store_true",
        help="Ignore expected_check_interval_minutes and run every AUTOMATION_READY source (backfill/manual use).",
    )
    ap.add_argument("--hub-url", default=None, help="Override GCOS_HUB_URL for the last_success_at read-back.")
    args = ap.parse_args()

    sources = select_sources(args.sources, force_due=args.force_due, hub_url=args.hub_url)
    if not sources:
        print("no sources selected (none due yet, or none AUTOMATION_READY)")
        return 0
    if not args.dry_run and not os.environ.get("TIP_RADAR_INGEST_TOKEN"):
        print("::error::TIP_RADAR_INGEST_TOKEN is not set")
        return 2

    cycle_started = time.time()
    cycle_started_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    rows = []
    for sid in sources:
        print(f"::group::{sid}")
        row = run_source(sid, args.timeout, args.retries, args.dry_run)
        rows.append(row)
        print(f"{sid}: {row.get('operator_status')} parsed={row.get('parsed', 0)} eligible={row.get('eligible', 0)} "
              f"new={row.get('new_rows', 0)} dup={row.get('duplicates', 0)} ok={row['ok']} attempts={row['attempts']}")
        print("::endgroup::")

    failed = [r for r in rows if not r["ok"]]
    empty = [r for r in rows if r["ok"] and not r.get("new_rows")]
    # Cycle status: HEALTHY (nothing selected, or everything ran clean) / PARTIAL (some but not all
    # sources failed) / FAILED (every selected source failed) — same three-state model as the Hub's
    # own continuous-tick summary, so both scheduling paths report status the same way.
    if not rows:
        cycle_status = "HEALTHY"
    elif not failed:
        cycle_status = "HEALTHY"
    elif len(failed) == len(rows):
        cycle_status = "FAILED"
    else:
        cycle_status = "PARTIAL"

    # A source can fetch fine and still be quietly broken (parser drift, cursor stuck, source
    # publishing elsewhere). The Hub already counts consecutive empty-eligible runs per source
    # (zero_accept_streak); read it back once after the batch and flag any that crossed the
    # threshold, instead of treating every 0-new-rows run as healthy.
    if not args.dry_run and rows:
        post_telemetry = fetch_hub_telemetry(args.hub_url or os.environ.get("GCOS_HUB_URL") or "http://127.0.0.1:8787")
        quiet_sources = [
            r["source_id"] for r in rows
            if int((post_telemetry.get(r["source_id"]) or {}).get("zero_accept_streak") or 0) >= ZERO_ACCEPT_STREAK_WARN_THRESHOLD
        ]
        if quiet_sources:
            print(f"::warning::{len(quiet_sources)} source(s) returned 0 new items for "
                  f"{ZERO_ACCEPT_STREAK_WARN_THRESHOLD}+ consecutive runs (possible parser/schema drift): "
                  + ", ".join(quiet_sources))
    else:
        quiet_sources = []

    cycle_finished_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    duration_s = round(time.time() - cycle_started, 1)
    cycle = {
        "started_at": cycle_started_at,
        "finished_at": cycle_finished_at,
        "duration_seconds": duration_s,
        "status": cycle_status,
        "sources_selected": len(rows),
        "sources_ok": len(rows) - len(failed),
        "sources_empty": len(empty),
        "sources_failed": len(failed),
        "sources_quiet_streak": quiet_sources,
        "articles_parsed": sum(r.get("parsed", 0) for r in rows),
        "articles_new": sum(r.get("new_rows", 0) for r in rows),
        "articles_duplicate": sum(r.get("duplicates", 0) for r in rows),
        "total_attempts": sum(r.get("attempts", 0) for r in rows),
    }

    out = Path(args.report_dir)
    out.mkdir(parents=True, exist_ok=True)
    stamp = cycle_finished_at
    (out / "run-report.json").write_text(
        json.dumps({"generated_at": stamp, "dry_run": args.dry_run, "cycle": cycle, "rows": rows}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    md = (
        f"## Hekimler Python runner — {stamp}\n\n"
        f"**Cycle status: {cycle_status}** | sources={cycle['sources_selected']} ok={cycle['sources_ok']} "
        f"empty={cycle['sources_empty']} failed={cycle['sources_failed']} | "
        f"new={cycle['articles_new']} dup={cycle['articles_duplicate']} | duration={duration_s}s\n\n"
        + quota_banner(rows) + markdown(rows)
    )
    (out / "run-report.md").write_text(md, encoding="utf-8")
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as fh:
            fh.write(md)
    print(md)
    print(f"cycle_status={cycle_status} sources={len(rows)} ok={len(rows) - len(failed)} failed={len(failed)}")
    if any(r.get("d1_quota") for r in rows):
        print("::error title=D1 quota exceeded::Cloudflare D1 daily write quota is exhausted; ingest rejected for "
              + ", ".join(r["source_id"] for r in rows if r.get("d1_quota")))
    if failed:
        print(f"::error::{len(failed)} of {len(rows)} sources failed: {', '.join(r['source_id'] for r in failed)}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
