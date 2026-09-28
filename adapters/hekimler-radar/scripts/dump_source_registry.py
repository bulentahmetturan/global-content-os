#!/usr/bin/env python3
"""Dump every Hekimler source's static registry facts as JSON, for
scripts/source-matrix.mjs to combine with live D1 telemetry. Read-only,
no network, no live access -- registry data only.

Usage: python3 dump_source_registry.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from radar.hekimler_activation import (  # noqa: E402
    ACTIVATION_AUTOMATION_READY,
    ACTIVATION_BLOCKED,
    ACTIVATION_MANUAL_INTAKE,
    all_sources,
    compute_activation_state,
)
from radar.hekimler_integrity import resolve_effective_registry  # noqa: E402

sys.path.insert(0, str(ROOT / "scripts"))
from check_source_identity import hekimler_heading  # noqa: E402


def main() -> int:
    effective = resolve_effective_registry()
    out = []
    for profile in all_sources(effective):
        sid = profile.get("source_id") or ""
        state = compute_activation_state(profile)
        plan = profile.get("fetch_plan") or {}
        wired = bool(profile.get("pipeline_wiring_enabled")) and state != ACTIVATION_BLOCKED
        out.append(
            {
                "source_id": sid,
                "primary_heading": hekimler_heading(sid, profile),
                "route": "tip-ogrencileri",
                "channel_id": "hekimler-toplulugu",
                "lifecycle_state": state,
                "status": profile.get("status"),
                "wired": wired,
                "fetch_enabled": bool(profile.get("fetch_enabled")),
                "execution": profile.get("execution") or plan.get("execution") or "python_runner",
                "poll_minutes": plan.get("expected_check_interval_minutes"),
                "url": profile.get("canonical_url") or profile.get("source_url") or profile.get("primary_url"),
                "manual_intake_reason": profile.get("manual_intake_reason") or profile.get("retired_reason"),
            }
        )
    # ensure_ascii=True: Windows consoles often use a non-UTF-8 codepage
    # (e.g. cp1254) for stdout, which raises UnicodeEncodeError on raw
    # non-ASCII output; \uXXXX-escaped JSON is still valid UTF-8 data once
    # json.loads()'d by the caller (scripts/source-matrix.mjs).
    print(json.dumps(out, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
