#!/usr/bin/env python3
"""Tip radar → Global Content OS adapter.

Reads the existing tip-ogrencileri-platformu radar SQLite (does NOT rewrite radar).
POSTs review candidates to Global Hub /api/ingress/tip.

Usage:
  python adapters/tip-radar/push_to_hub.py
  python adapters/tip-radar/push_to_hub.py --db path/to/radar.sqlite --hub http://127.0.0.1:8787
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_DB = Path(__file__).resolve().parents[3] / "multi_channel_design" / "channels" / "tip-ogrencileri-platformu" / "database" / "radar.sqlite"
# When this adapter lives inside global-content-os, sibling is ../multi_channel_design
SIBLING_DB = Path(__file__).resolve().parents[2].parent / "multi_channel_design" / "channels" / "tip-ogrencileri-platformu" / "database" / "radar.sqlite"


def resolve_db(explicit: str | None) -> Path:
    if explicit:
        return Path(explicit)
    env = os.environ.get("RADAR_DB_PATH")
    if env:
        return Path(env)
    if SIBLING_DB.exists():
        return SIBLING_DB
    if DEFAULT_DB.exists():
        return DEFAULT_DB
    raise SystemExit(f"radar.sqlite not found. Tried {SIBLING_DB} and {DEFAULT_DB}")


def load_candidates(db_path: Path, status: str, limit: int) -> list[dict]:
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    cols = {r[1] for r in conn.execute("PRAGMA table_info(candidates)").fetchall()}
    required = {"id", "title", "summary", "status"}
    if not required.issubset(cols):
        raise SystemExit(f"unexpected candidates schema; have {sorted(cols)}")

    url_col = "url" if "url" in cols else ("source_url" if "source_url" in cols else None)
    institution_col = "institution" if "institution" in cols else None
    category_col = "category" if "category" in cols else None
    event_col = "event_date" if "event_date" in cols else None
    source_id_col = "source_id" if "source_id" in cols else None

    select = ["id", "title", "summary", "status"]
    if url_col:
        select.append(url_col)
    if institution_col:
        select.append(institution_col)
    if category_col:
        select.append(category_col)
    if event_col:
        select.append(event_col)
    if source_id_col:
        select.append(source_id_col)

    if status == "all":
        sql = f"SELECT {', '.join(select)} FROM candidates ORDER BY id DESC LIMIT ?"
        rows = conn.execute(sql, (limit,)).fetchall()
    else:
        sql = f"SELECT {', '.join(select)} FROM candidates WHERE status = ? ORDER BY id DESC LIMIT ?"
        rows = conn.execute(sql, (status, limit)).fetchall()
    conn.close()

    out: list[dict] = []
    for row in rows:
        url = (row[url_col] if url_col else None) or f"tip-radar://candidate/{row['id']}"
        out.append(
            {
                "externalId": row["id"],
                "title": row["title"],
                "summary": row["summary"] or row["title"],
                "url": url,
                "institution": row[institution_col] if institution_col else None,
                "category": row[category_col] if category_col else None,
                "eventDate": row[event_col] if event_col else None,
                "status": row["status"],
                "sourceId": row[source_id_col] if source_id_col else None,
            }
        )
    return out


def push(hub: str, token: str, candidates: list[dict]) -> dict:
    body = json.dumps({"candidates": candidates}).encode("utf-8")
    req = urllib.request.Request(
        hub.rstrip("/") + "/api/ingress/tip",
        data=body,
        headers={
            "Content-Type": "application/json",
            "X-Ingest-Token": token,
            "User-Agent": "global-content-os-tip-adapter/0.1",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> None:
    parser = argparse.ArgumentParser(description="Push tip radar candidates into Global Hub")
    parser.add_argument("--db", help="Path to radar.sqlite")
    parser.add_argument("--hub", default=os.environ.get("GCOS_HUB_URL", "http://127.0.0.1:8787"))
    parser.add_argument("--token", default=os.environ.get("TIP_RADAR_INGEST_TOKEN", "dev-tip-ingest-token"))
    parser.add_argument("--status", default="review", help="review | approved | rejected | all")
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    db_path = resolve_db(args.db)
    candidates = load_candidates(db_path, args.status, args.limit)
    print(f"loaded {len(candidates)} candidates from {db_path} (status={args.status})")

    if args.dry_run:
        print(json.dumps(candidates[:3], ensure_ascii=False, indent=2))
        return

    if not candidates:
        print("nothing to push")
        return

    chunk = 200
    total_created = 0
    total_updated = 0
    for i in range(0, len(candidates), chunk):
        batch = candidates[i : i + chunk]
        try:
            result = push(args.hub, args.token, batch)
        except urllib.error.URLError as exc:
            print(f"push failed at batch {i}: {exc}", file=sys.stderr)
            raise SystemExit(1) from exc
        total_created += int(result.get("created") or 0)
        total_updated += int(result.get("updated") or 0)
        print(json.dumps({"batchFrom": i, **result}, ensure_ascii=False))

    print(json.dumps({"ok": True, "created": total_created, "updated": total_updated, "total": len(candidates)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
