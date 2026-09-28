#!/usr/bin/env python3
"""Health check for the Hekimler burs source pool (no ingest)."""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from radar.hekimler_activation import compute_activation_state  # noqa: E402
from radar.hekimler_burs import load_burs_pool, load_burs_registry  # noqa: E402
from radar.hekimler_integrity import resolve_effective_registry, resolve_profile  # noqa: E402

UA = "HekimlerBursHealth/1.0 (+https://global-content-os.local)"


def head(url: str, timeout: int = 20) -> tuple[str, int | None]:
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return "ok", int(getattr(resp, "status", 200) or 200)
    except urllib.error.HTTPError as e:
        return "http_error", int(e.code)
    except Exception:
        return "erisilemedi", None


def main() -> int:
    today = date.today().isoformat()
    burs = load_burs_registry()
    pool = load_burs_pool()
    eff = resolve_effective_registry()
    rows = []
    for src in burs["sources"]:
        sid = src["source_id"]
        url = src.get("canonical_url") or src.get("source_url")
        status, code = head(url) if url else ("erisilemedi", None)
        activation = compute_activation_state(resolve_profile(sid, eff))
        rows.append(
            {
                "source_id": sid,
                "url": url,
                "http": code,
                "url_durum": status,
                "activation": activation,
                "son_kontrol": today,
            }
        )
        print(f"{sid:32} {activation:16} {status:12} {code or '-'}  {url}")
    print(f"\nkaynak={len(rows)} ilan={len(pool.get('burs_ilanlari') or [])}")
    out = ROOT / "content" / "burs" / "last_health.json"
    out.write_text(json.dumps({"checked_at": today, "sources": rows}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
