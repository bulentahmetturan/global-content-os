"""Read-only bridge for scripts/source-lifecycle (Node) to the canonical Tıp Topluluğu gates. Never writes anything.

  python scripts/tip_toplulugu_lifecycle_bridge.py gates     < profile.json
      -> {"computed": <activation state>, "gates_ok": bool, "failures": [...]}  (radar.tip_toplulugu_activation)
  python scripts/tip_toplulugu_lifecycle_bridge.py identity  < {"source_id", "url", "heading", "lane"}
      -> {"violations": [...]} S66 one-primary-heading result WITH the candidate added (check_source_identity.py)

Capacity is not bridged: callers run the existing guard `scripts/tip_toplulugu_ops.py capacity` unchanged.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))


def gates(profile: dict) -> dict:
    os.environ.setdefault("TIP_TOPLULUGU_CONTINUOUS_INGESTION_ENABLED", "true")
    from radar.tip_toplulugu_activation import automation_ready_gates, compute_activation_state

    ok, failures = automation_ready_gates(profile)
    return {"computed": compute_activation_state(profile), "gates_ok": ok, "failures": failures}


def identity(candidate: dict) -> dict:
    import check_source_identity as csi

    dom = csi._domain(candidate.get("url"))
    sid = candidate.get("source_id") or "candidate"
    heading = candidate.get("heading") or "DUYURU"
    base_k, base_h = csi.kaduse_domains, csi.tip_toplulugu_domains

    def with_candidate(base, lanes):
        def inner():
            out = {k: [e for e in v if e[0] != sid] for k, v in base().items()}
            if dom and candidate.get("lane") in lanes:
                out.setdefault(dom, []).append((sid, heading))
            return out

        return inner

    csi.kaduse_domains = with_candidate(base_k, ("kaduse-news", "kaduse-research"))
    csi.tip_toplulugu_domains = with_candidate(base_h, ("tip_toplulugu",))
    try:
        violations = [v for v in csi.find_violations() if v["domain"] == dom]
    finally:
        csi.kaduse_domains, csi.tip_toplulugu_domains = base_k, base_h
    return {"domain": dom, "violations": violations, "documented_exception": dom in csi.DOCUMENTED_MULTI_HEADING_EXCEPTIONS}


def main() -> int:
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    payload = json.loads(sys.stdin.read() or "{}")
    if cmd == "gates":
        out = gates(payload)
    elif cmd == "identity":
        out = identity(payload)
    else:
        print(json.dumps({"error": f"unknown command {cmd!r}"}))
        return 2
    print(json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
