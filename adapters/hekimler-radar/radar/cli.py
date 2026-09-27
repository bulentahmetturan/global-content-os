from __future__ import annotations

import argparse

from .config import settings
from .database import Database
from .dashboard import serve
from .digest import build_digest
from .pipeline import run


def main() -> None:
    parser = argparse.ArgumentParser(description="Tıp Öğrencileri Editoryal Radar")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("init")
    run_parser = sub.add_parser("run")
    run_parser.add_argument("--source")
    sub.add_parser("list-candidates")
    for name in ("approve", "reject"):
        p = sub.add_parser(name)
        p.add_argument("id", type=int)
    dash = sub.add_parser("dashboard")
    dash.add_argument("--port", type=int, default=8765)
    digest_parser = sub.add_parser("digest")
    digest_parser.add_argument("--hours", type=int, default=24)
    canary = sub.add_parser("hekimler-phase1-canary")
    canary.add_argument("--source", help="Single Phase 1 source_id")
    canary.add_argument("--commit", action="store_true", help="Persist candidates (default is dry-run)")
    canary.add_argument(
        "--force-due",
        action="store_true",
        help="Bypass check-interval only (never bypasses feature flag, TLS, allowlists, or medical gates)",
    )
    canary.add_argument(
        "--force",
        action="store_true",
        help="Deprecated alias for --force-due (does NOT enable the feature flag)",
    )
    continuous = sub.add_parser("hekimler-continuous")
    continuous.add_argument("--source", help="Single AUTOMATION_READY source_id")
    continuous.add_argument("--commit", action="store_true", help="Deliver to Hub review (default dry-run)")
    continuous.add_argument(
        "--force-due",
        action="store_true",
        help="Bypass per-source interval for this tick only",
    )
    continuous.add_argument(
        "--activation-report",
        action="store_true",
        help="Print activation grouping and exit (no HTTP)",
    )
    continuous.add_argument(
        "--sync-worker-profiles",
        action="store_true",
        help="Write AUTOMATION_READY profile bundle for the Worker runner",
    )
    args = parser.parse_args()
    db = Database(settings.db_path)
    db.init()
    if args.command == "init":
        print(f"Veritabanı hazır: {settings.db_path}")
    elif args.command == "run":
        print(run(settings, args.source))
    elif args.command == "list-candidates":
        for row in db.list_candidates():
            print(row["id"], row["status"], row["urgency_score"], row["institution"], row["title"])
    elif args.command in {"approve", "reject"}:
        db.set_status(args.id, "approved" if args.command == "approve" else "rejected")
        print("Güncellendi")
    elif args.command == "dashboard":
        serve(db, port=args.port)
    elif args.command == "digest":
        print(build_digest(db, hours=args.hours))
    elif args.command == "hekimler-phase1-canary":
        from .hekimler_hub_bridge import HttpHubDeliveryClient
        from .phase1_ingestion_canary import format_operator_status, run_phase1_canary

        hub_client = None
        if args.commit:
            # Commit targets canonical Hub — never silent local SQLite as deployed store
            hub_client = HttpHubDeliveryClient()
        summary = run_phase1_canary(
            db=db,
            dry_run=not args.commit,
            source_id=args.source,
            force_due=bool(args.force_due or args.force),
            hub_client=hub_client,
            persist_local=False,
        )
        print(format_operator_status(summary))
    elif args.command == "hekimler-continuous":
        import json

        from .hekimler_continuous_runner import (
            default_hub_client,
            format_continuous_status,
            run_continuous_ingestion,
            write_worker_profile_bundle,
        )
        from .hekimler_activation import activation_report
        from .hekimler_integrity import resolve_effective_registry

        if args.activation_report:
            print(json.dumps(activation_report(resolve_effective_registry()), ensure_ascii=False, indent=2))
            return
        if args.sync_worker_profiles:
            path = write_worker_profile_bundle()
            print(f"wrote {path}")
            return
        hub_client = default_hub_client() if args.commit else None
        summary = run_continuous_ingestion(
            db=db,
            dry_run=not args.commit,
            force_due=bool(args.force_due),
            hub_client=hub_client,
            source_id=args.source,
        )
        print(format_continuous_status(summary))


if __name__ == "__main__":
    main()
