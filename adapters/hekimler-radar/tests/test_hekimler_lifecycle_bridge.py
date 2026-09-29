"""scripts/hekimler_lifecycle_bridge.py: read-only answers from the canonical gates for the Node lifecycle tool."""
from __future__ import annotations

import copy
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import hekimler_lifecycle_bridge as bridge  # noqa: E402

READY = {
    "source_id": "lifecycle_probe",
    "status": "active",
    "fetch_mode": "list-page",
    "fetch_enabled": True,
    "scheduled_fetch_enabled": True,
    "candidate_emission_enabled": True,
    "pipeline_wiring_enabled": True,
    "publication_eligible": False,
    "include_keywords": ["hekim"],
    "runtime_activation": "AUTOMATION_READY",
    "fetch_plan": {
        "primary_method": "list-page",
        "tls_verification_required": True,
        "allowed_hostnames": ["www.example.org.tr"],
        "allowed_path_patterns": ["/duyurular/"],
    },
}


def _registry_digest() -> str:
    h = hashlib.sha256()
    for p in sorted((ROOT / "content").glob("source-registry-*.json")):
        h.update(p.read_bytes())
    return h.hexdigest()


def test_gates_ready_profile():
    out = bridge.gates(copy.deepcopy(READY))
    assert out == {"computed": "AUTOMATION_READY", "gates_ok": True, "failures": []}


def test_retired_profile_is_blocked_and_never_scheduled():
    p = copy.deepcopy(READY)
    p["status"] = "retired"
    assert bridge.gates(p)["computed"] == "BLOCKED"


def test_forced_ready_with_failing_gates_is_not_honoured():
    p = copy.deepcopy(READY)
    p["fetch_plan"]["tls_verification_required"] = False
    out = bridge.gates(p)
    assert out["computed"] == "MANUAL_INTAKE"
    assert "missing_tls_host_path_rules" in out["failures"]


def test_identity_detects_second_heading_on_owned_domain_and_restores_module():
    import check_source_identity as csi

    before = (csi.kaduse_domains, csi.hekimler_domains)
    out = bridge.identity({"source_id": "burs_probe", "url": "https://www.nrmp.org/x/", "heading": "BURS", "lane": "hekimler"})
    assert out["domain"] == "nrmp.org"
    assert len(out["violations"]) == 1
    assert (csi.kaduse_domains, csi.hekimler_domains) == before


def test_identity_allows_documented_exception_and_new_domain():
    assert bridge.identity({"source_id": "p", "url": "https://www.ecdc.europa.eu/en/x", "heading": "BURS", "lane": "hekimler"})["violations"] == []
    assert bridge.identity({"source_id": "p", "url": "https://brand-new-domain.example/", "heading": "DUYURU", "lane": "hekimler"})["violations"] == []


def test_cli_is_read_only():
    digest = _registry_digest()
    r = subprocess.run([sys.executable, str(ROOT / "scripts" / "hekimler_lifecycle_bridge.py"), "gates"], input=json.dumps(READY), capture_output=True, text=True, cwd=ROOT, timeout=120)
    assert r.returncode == 0
    assert json.loads(r.stdout)["computed"] == "AUTOMATION_READY"
    assert _registry_digest() == digest
