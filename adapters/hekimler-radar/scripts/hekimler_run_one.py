"""Run ONE Hekimler source through the Python runner and print a single JSON result line.

Isolated in its own process so the scheduler can enforce a hard per-source timeout and so one failing source
can never take down the batch.  The ingest token is read from TIP_RADAR_INGEST_TOKEN by the Hub client and is
never printed.
"""
from __future__ import annotations

import json
import os
import sys
import time
from dataclasses import asdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def main() -> int:
    source_id = sys.argv[1]
    dry_run = "--dry-run" in sys.argv
    os.environ.setdefault("HEKIMLER_CONTINUOUS_INGESTION_ENABLED", "true")

    from radar.hekimler_activation import all_sources
    from radar.hekimler_integrity import resolve_effective_registry

    prof = [s for s in all_sources(resolve_effective_registry()) if s["source_id"] == source_id]
    if prof and prof[0].get("http_timeout_seconds"):
        os.environ["HEKIMLER_HTTP_TIMEOUT"] = str(int(prof[0]["http_timeout_seconds"]))

    from radar.config import settings
    from radar.database import Database
    from radar.hekimler_continuous_runner import default_hub_client, run_continuous_ingestion

    started = time.time()
    db = Database(settings.db_path)
    db.init()
    hub = None if dry_run else default_hub_client()
    summary = run_continuous_ingestion(
        db=db, dry_run=dry_run, force_due=True, hub_client=hub, source_id=source_id
    )
    out = {"source_id": source_id, "seconds": round(time.time() - started, 1), "results": []}
    for r in summary.results:
        out["results"].append(asdict(r) if hasattr(r, "__dataclass_fields__") else dict(r))
    print("RESULT_JSON " + json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
