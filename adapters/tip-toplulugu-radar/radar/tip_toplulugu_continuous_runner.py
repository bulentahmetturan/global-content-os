"""Tıp Topluluğu Continuous Ingestion Fast Activation v1 — generic registry runner.

One runner for all AUTOMATION_READY sources. No per-source custom pipelines.
Delivers to Global Content OS Hub review only (never publishes).
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .database import Database
from .tip_toplulugu_activation import (
    all_sources,
    ACTIVATION_AUTOMATION_READY,
    ACTIVATION_BLOCKED,
    ACTIVATION_MANUAL_INTAKE,
    activation_report,
    compute_activation_state,
    select_automation_ready_due,
)
from .tip_toplulugu_audience_scope import load_scope_policy
from .tip_toplulugu_hub_bridge import (
    PHASE1_LIVE_ELIGIBLE_SOURCE_IDS,
    HubDeliveryClient,
    HttpHubDeliveryClient,
)
from .tip_toplulugu_integrity import resolve_effective_registry
from .phase1_ingestion_canary import (
    FEATURE_FLAG,
    TransportFn,
    ensure_ingestion_schema,
    ingest_one_source,
    ingestion_enabled,
    last_success_for,
    tls_verified_get,
)

CONTINUOUS_FEATURE_FLAG = "TIP_TOPLULUGU_CONTINUOUS_INGESTION_ENABLED"
DUE_CHECK_MINUTES = 15  # scheduler tick cadence (per-source interval still applies)


@dataclass
class ContinuousRunSummary:
    enabled: bool
    dry_run: bool
    commit_target: str
    due_check_minutes: int = DUE_CHECK_MINUTES
    automation_ready_count: int = 0
    due_count: int = 0
    skipped_not_due: int = 0
    results: list[Any] = field(default_factory=list)
    activation: dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "enabled": self.enabled,
            "dry_run": self.dry_run,
            "commit_target": self.commit_target,
            "due_check_minutes": self.due_check_minutes,
            "automation_ready_count": self.automation_ready_count,
            "due_count": self.due_count,
            "skipped_not_due": self.skipped_not_due,
            "results": [
                r.__dict__ if hasattr(r, "__dict__") else r for r in self.results
            ],
            "activation_counts": self.activation.get("counts"),
        }


def continuous_enabled() -> bool:
    """Continuous production flag. Falls back to Phase 1 canary flag for rollout."""
    raw = os.environ.get(CONTINUOUS_FEATURE_FLAG, "").strip().lower()
    if raw in {"1", "true", "yes", "on"}:
        return True
    if raw in {"0", "false", "no", "off"}:
        return False
    return ingestion_enabled()


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def export_automation_ready_profiles(
    effective: dict[str, Any] | None = None,
    *,
    worker_only: bool = False,
) -> list[dict[str, Any]]:
    """Profiles the generic runner will schedule (metadata only — no secrets)."""
    reg = effective or resolve_effective_registry()
    out = []
    for src in all_sources(reg):
        if compute_activation_state(src) != ACTIVATION_AUTOMATION_READY:
            continue
        if worker_only and src.get("execution") == "python_runner":
            continue  # heavy pages exceed the Worker CPU budget; ingested by the Python runner
        out.append(
            {
                "source_id": src["source_id"],
                "label": src.get("label"),
                "source_tier": src.get("source_tier"),
                "source_url": src.get("source_url"),
                "primary_url": src.get("primary_url"),
                "include_keywords": src.get("include_keywords") or [],
                "exclude_keywords": src.get("exclude_keywords") or [],
                "audience_segments": src.get("audience_segments") or [],
                "default_route_on_accept": src.get("default_route_on_accept"),
                "runtime_activation": ACTIVATION_AUTOMATION_READY,
                "fetch_plan": src.get("fetch_plan") or {},
                "fetch_enabled": True,
                "scheduled_fetch_enabled": True,
                "candidate_emission_enabled": True,
                "pipeline_wiring_enabled": True,
                "publication_eligible": False,
                "scope_url_in_gate": bool(src.get("scope_url_in_gate")),
                "scope_url_keywords": src.get("scope_url_keywords") or [],
                "item_url_patterns": src.get("item_url_patterns") or [],
                "item_title_patterns": src.get("item_title_patterns") or [],
                "allow_congress": bool(src.get("allow_congress")),
                "approved_query_pack": src.get("approved_query_pack") or [],
                "reject_unrestricted_search": bool(src.get("reject_unrestricted_search")),
                "coverage_policy": (src.get("fetch_plan") or {}).get("coverage_policy")
                or src.get("coverage_policy")
                or {},
                "require_pmid": bool(src.get("require_pmid")),
                "eutilities": (src.get("fetch_plan") or {}).get("eutilities") or {},
                "forbidden_hosts": (src.get("fetch_plan") or {}).get("forbidden_hosts") or [],
            }
        )
    return out


def _worker_ingress_dir(gcos_root: Path) -> Path:
    """Locate Worker ingress. Radar now lives inside global-content-os; prefer same-repo ingress."""
    same = gcos_root / "apps" / "worker" / "src" / "ingress"
    if same.is_dir():
        return same
    # Legacy: radar used to live under multi_channel_design and wrote into a sibling checkout.
    for name in ("global-content-os", "gcos-deploy"):
        candidate = gcos_root.parent / name / "apps" / "worker" / "src" / "ingress"
        if candidate.is_dir():
            return candidate
    return same


def write_worker_profile_bundle(dest: Path | None = None) -> Path:
    """Sync AUTOMATION_READY profiles into the Worker repo's ingress dir for the Worker runner."""
    profiles = export_automation_ready_profiles(worker_only=True)
    gcos_root = Path(__file__).resolve().parents[3]  # global-content-os
    ingress = _worker_ingress_dir(gcos_root)
    path = dest or (ingress / "tip-toplulugu-automation-ready.ts")
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "version": "tip-toplulugu-continuous-v1",
        "generated_at": _utcnow_iso(),
        "channel_id": "tip_toplulugu",
        "editorial_brand": "Tıp Topluluğu",
        "content_family": "tip_toplulugu_phase1",
        "decision": "NEEDS_REVIEW",
        "auto_publish": False,
        "audience_scope": load_scope_policy(),
        "python_runner_source_ids": sorted(p["source_id"] for p in export_automation_ready_profiles() if p["source_id"] not in {q["source_id"] for q in profiles}),
        "profiles": profiles,
    }
    # TypeScript module (avoids resolveJsonModule issues in Worker build)
    body = (
        "/** Auto-generated by tip_toplulugu_continuous_runner.write_worker_profile_bundle — do not edit by hand. */\n"
        f"export const readyBundle = {json.dumps(payload, ensure_ascii=False, indent=2)} as const;\n"
        "export default readyBundle;\n"
    )
    path.write_text(body, encoding="utf-8")
    # Also keep JSON mirror for operators
    json_path = path.with_suffix(".json")
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


def run_continuous_ingestion(
    *,
    db: Database,
    dry_run: bool = True,
    force_due: bool = False,
    transport: TransportFn | None = None,
    hub_client: HubDeliveryClient | None = None,
    persist_runs: bool = True,
    source_id: str | None = None,
) -> ContinuousRunSummary:
    """Due-source tick: only AUTOMATION_READY + due profiles make HTTP requests."""
    enabled = continuous_enabled()
    commit_target = "none" if dry_run else ("hub" if hub_client is not None else "unconfigured")
    effective = resolve_effective_registry()
    report = activation_report(effective)
    summary = ContinuousRunSummary(
        enabled=enabled,
        dry_run=dry_run,
        commit_target=commit_target,
        activation=report,
        automation_ready_count=report["counts"].get(ACTIVATION_AUTOMATION_READY, 0),
    )

    if not enabled:
        summary.results.append(
            {
                "operator_status": "feature_flag_off",
                "error_reason": f"{CONTINUOUS_FEATURE_FLAG} / {FEATURE_FLAG} not enabled",
            }
        )
        return summary

    if not dry_run and hub_client is None:
        summary.results.append(
            {
                "operator_status": "hub_client_required",
                "error_reason": "commit mode requires Hub client — local SQLite is not production SoT",
            }
        )
        return summary

    ensure_ingestion_schema(db)
    db.init()
    transport = transport or tls_verified_get

    last_map: dict[str, str | None] = {}
    for src in all_sources(effective):
        sid = src["source_id"]
        last_success, _, _ = last_success_for(db, sid)
        last_map[sid] = last_success

    due_profiles = select_automation_ready_due(
        effective, last_success_by_source=last_map, force_due=force_due
    )
    if source_id:
        due_profiles = [p for p in due_profiles if p["source_id"] == source_id]

    ready_ids = {
        s["source_id"]
        for s in all_sources(effective)
        if compute_activation_state(s) == ACTIVATION_AUTOMATION_READY
    }
    summary.due_count = len(due_profiles)
    summary.skipped_not_due = max(0, len(ready_ids) - len(due_profiles))

    # Guard: never fetch MANUAL_INTAKE / BLOCKED even if someone passes source_id
    for profile in due_profiles:
        state = compute_activation_state(profile)
        if state != ACTIVATION_AUTOMATION_READY:
            summary.results.append(
                {
                    "source_id": profile["source_id"],
                    "operator_status": f"blocked_{state.lower()}",
                    "error_reason": "activation state forbids HTTP",
                }
            )
            continue
        result = ingest_one_source(
            profile,
            db=db,
            dry_run=dry_run,
            transport=transport,
            force_due=True,  # already interval-filtered above
            hub_client=hub_client,
            persist_local=False,
        )
        if persist_runs:
            from .phase1_ingestion_canary import persist_run

            persist_run(db, result, dry_run=dry_run)
        if not dry_run and hub_client is not None and hasattr(hub_client, "post_telemetry"):
            ok_run = result.hub_delivery_failures == 0 and result.fetch_result == "ok"
            tele_ok, tele_msg = hub_client.post_telemetry(
                {
                    "sourceId": result.source_id,
                    "executor": "python_runner",
                    "ok": ok_run,
                    "operatorStatus": result.operator_status,
                    "fetchResult": result.fetch_result,
                    "inspected": result.item_count,
                    "eligible": result.accepted_count + result.duplicate_count,
                    "duplicates": result.duplicate_count,
                    "hubFailures": result.hub_delivery_failures,
                    "rejectedShape": result.rejected_shape,
                    "rejectedAudience": result.rejected_audience,
                    "rejectedKeyword": result.rejected_keyword,
                    "rejectedDate": result.rejected_date,
                    "newestRecordDate": result.newest_record_date,
                    "error": result.error_reason,
                    "contentHash": result.last_content_hash,
                }
            )
            if not tele_ok:
                import sys

                print(f"telemetry post failed for {result.source_id}: {tele_msg}", file=sys.stderr)
        summary.results.append(result)

    return summary


def format_continuous_status(summary: ContinuousRunSummary) -> str:
    lines = [
        f"Tıp Topluluğu Continuous v1 | enabled={summary.enabled} dry_run={summary.dry_run}"
        f" commit_target={summary.commit_target}",
        f" AUTOMATION_READY={summary.automation_ready_count}"
        f" due={summary.due_count} skipped_not_due={summary.skipped_not_due}",
        f" activation={summary.activation.get('counts')}",
    ]
    for r in summary.results:
        if hasattr(r, "source_id"):
            lines.append(
                f"- {r.source_id}: {r.operator_status}"
                f" accepted={r.accepted_count} discarded={r.discarded_count}"
                f" dup={r.duplicate_count} hub_fail={r.hub_delivery_failures}"
                f" health={r.source_health}"
            )
        elif isinstance(r, dict):
            lines.append(f"- {r.get('source_id', '*')}: {r.get('operator_status')}")
    return "\n".join(lines)


def default_hub_client() -> HttpHubDeliveryClient:
    return HttpHubDeliveryClient()
