"""Hekimler Hub Ingestion Bridge v1.

Canonical deployed Candidate/Review destination: Global Content OS Hub
(`POST /api/ingress/tip` on global-content-os).

Local tip-radar SQLite remains a development/fixture harness only — never a
second production source of truth.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Protocol

HEKIMLER_CHANNEL_ID = "hekimler-toplulugu"
HEKIMLER_EDITORIAL_BRAND = "Hekimler Topluluğu"
HEKIMLER_CONTENT_FAMILY = "hekimler_phase1"
HEKIMLER_HUB_FEED_ID = "hekimler-phase1-canary"
HEKIMLER_HUB_ROUTE = "tip-ogrencileri"  # Hub route id (inbox lane); channel_id partitions brand

# Five sources eligible for later live validation (TÜİK remains MANUAL_REVIEW blocked)
PHASE1_LIVE_ELIGIBLE_SOURCE_IDS = frozenset(
    {
        "osym_medical_exams",
        "yok_medical_education",
        "yokak_medical_accreditation",
        "tuk_specialty_training",
        "resmi_gazete_medical_regulation",
    }
)


@dataclass
class HubCandidatePayload:
    """Wire payload compatible with TipRadarCandidatePush (+ Hekimler partition)."""

    external_id: str
    title: str
    summary: str
    url: str
    source_id: str
    content_hash: str
    channel_id: str = HEKIMLER_CHANNEL_ID
    editorial_brand: str = HEKIMLER_EDITORIAL_BRAND
    content_family: str = HEKIMLER_CONTENT_FAMILY
    primary_url: str | None = None
    institution: str | None = None
    decision: str | None = None
    decision_route: str | None = None
    evidence_status: str | None = None
    source_policy_applied: str | None = None
    audience_segments: list[str] = field(default_factory=list)
    routing_reason: str | None = None
    risk_flags: list[str] = field(default_factory=list)
    provenance: dict[str, Any] = field(default_factory=dict)
    fetched_at: str | None = None
    created_at: str | None = None
    discovered_at: str | None = None
    event_date: str | None = None  # official publication date (ISO day) when known
    dedupe_group: str | None = None  # overlapping sources share one dedupe namespace

    def validate(self) -> str | None:
        if not (self.channel_id or "").strip():
            return "missing channel_id"
        if self.channel_id != HEKIMLER_CHANNEL_ID:
            return f"invalid channel_id: {self.channel_id}"
        if self.editorial_brand != HEKIMLER_EDITORIAL_BRAND:
            return "invalid editorial_brand"
        if self.content_family != HEKIMLER_CONTENT_FAMILY:
            return "invalid content_family"
        if not (self.source_id or "").strip():
            return "missing source_id"
        if not (self.content_hash or "").strip():
            return "missing content_hash"
        if not (self.title or "").strip():
            return "missing title"
        if not (self.url or self.primary_url or "").strip():
            return "missing url"
        return None

    def dedupe_key(self) -> str:
        return f"hekimler:{self.channel_id}:{self.dedupe_group or self.source_id}:{self.content_hash}"

    def to_hub_json(self) -> dict[str, Any]:
        return {
            "externalId": self.external_id,
            "title": self.title,
            "summary": self.summary,
            "url": self.url or self.primary_url,
            "primaryUrl": self.primary_url or self.url,
            "institution": self.institution,
            "sourceId": self.source_id,
            "channelId": self.channel_id,
            "editorialBrand": self.editorial_brand,
            "contentFamily": self.content_family,
            "contentHash": self.content_hash,
            "decision": self.decision,
            "decisionRoute": self.decision_route,
            "evidenceStatus": self.evidence_status,
            "sourcePolicyApplied": self.source_policy_applied or self.source_id,
            "audienceSegments": list(self.audience_segments),
            "routingReason": self.routing_reason,
            "riskFlags": list(self.risk_flags),
            "provenance": dict(self.provenance),
            "fetchedAt": self.fetched_at,
            "createdAt": self.created_at,
            "discoveredAt": self.discovered_at or self.fetched_at or self.created_at,
            "eventDate": self.event_date,
            "dedupeGroup": self.dedupe_group,
            "status": "review",
            "category": None,  # do not overload category as channel identity
            "auto_publish": False,
            "publication_eligible": False,
        }


@dataclass
class HubDeliveryResult:
    ok: bool
    created: bool = False
    updated: bool = False
    duplicate: bool = False
    hub_item_id: str | None = None
    dedupe_key: str | None = None
    error: str | None = None
    delivery_status: str = "pending"  # pending | delivered | failed

    @property
    def delivered(self) -> bool:
        return self.ok and self.delivery_status == "delivered"


class HubDeliveryClient(Protocol):
    def deliver(self, payload: HubCandidatePayload) -> HubDeliveryResult: ...


@dataclass
class InMemoryHubItem:
    id: str
    channel_id: str
    editorial_brand: str | None
    content_family: str | None
    source_id: str | None
    decision_route: str | None
    triage_status: str
    dedupe_key: str
    title: str
    summary: str
    canonical_url: str
    content_hash: str | None
    intake_meta: dict[str, Any]
    fetched_at: str | None
    created_at: str | None
    route: str = HEKIMLER_HUB_ROUTE


class InMemoryHubStore:
    """Test/dev stand-in for Global Content OS Hub source_items partition."""

    def __init__(self) -> None:
        self.items: dict[str, InMemoryHubItem] = {}  # dedupe_key → item
        self._seq = 0
        self.fail_next: bool = False
        self.fail_message: str = "simulated hub delivery failure"

    def deliver(self, payload: HubCandidatePayload) -> HubDeliveryResult:
        err = payload.validate()
        if err:
            return HubDeliveryResult(
                ok=False,
                error=err,
                delivery_status="failed",
                dedupe_key=payload.dedupe_key(),
            )
        if self.fail_next:
            self.fail_next = False
            return HubDeliveryResult(
                ok=False,
                error=self.fail_message,
                delivery_status="failed",
                dedupe_key=payload.dedupe_key(),
            )

        key = payload.dedupe_key()
        if key in self.items:
            existing = self.items[key]
            existing.title = payload.title
            existing.summary = payload.summary
            return HubDeliveryResult(
                ok=True,
                created=False,
                updated=True,
                duplicate=True,
                hub_item_id=existing.id,
                dedupe_key=key,
                delivery_status="delivered",
            )

        self._seq += 1
        item_id = f"item_hekimler_{self._seq:04d}"
        item = InMemoryHubItem(
            id=item_id,
            channel_id=payload.channel_id,
            editorial_brand=payload.editorial_brand,
            content_family=payload.content_family,
            source_id=payload.source_id,
            decision_route=payload.decision_route or payload.decision,
            triage_status="inbox",
            dedupe_key=key,
            title=payload.title,
            summary=payload.summary,
            canonical_url=payload.url or payload.primary_url or "",
            content_hash=payload.content_hash,
            intake_meta=payload.to_hub_json(),
            fetched_at=payload.fetched_at,
            created_at=payload.created_at,
        )
        self.items[key] = item
        return HubDeliveryResult(
            ok=True,
            created=True,
            updated=False,
            hub_item_id=item_id,
            dedupe_key=key,
            delivery_status="delivered",
        )

    def review_query(
        self,
        *,
        channel_id: str | None = None,
        editorial_brand: str | None = None,
        content_family: str | None = None,
        status: str | None = "inbox",
        source_id: str | None = None,
        decision_route: str | None = None,
    ) -> list[InMemoryHubItem]:
        """Queryable partition — does not read raw_analysis_json."""
        out = []
        for item in self.items.values():
            if channel_id is not None and item.channel_id != channel_id:
                continue
            if editorial_brand is not None and item.editorial_brand != editorial_brand:
                continue
            if content_family is not None and item.content_family != content_family:
                continue
            if status is not None and item.triage_status != status:
                continue
            if source_id is not None and item.source_id != source_id:
                continue
            if decision_route is not None and item.decision_route != decision_route:
                continue
            out.append(item)
        return out

    def seed_tip_student(
        self,
        *,
        title: str,
        source_id: str = "faculty_example",
        content_hash: str = "tip-legacy-hash",
    ) -> InMemoryHubItem:
        """Legacy tip-student row: channel tip-ogrencileri-platformu, null Hekimler fields."""
        self._seq += 1
        key = f"tip-radar:{self._seq}"
        item = InMemoryHubItem(
            id=f"item_tip_{self._seq:04d}",
            channel_id="tip-ogrencileri-platformu",
            editorial_brand=None,
            content_family=None,
            source_id=source_id,
            decision_route=None,
            triage_status="inbox",
            dedupe_key=key,
            title=title,
            summary=title,
            canonical_url=f"https://example.edu.tr/{content_hash}",
            content_hash=content_hash,
            intake_meta={},
            fetched_at=None,
            created_at=None,
        )
        self.items[key] = item
        return item


class HttpHubDeliveryClient:
    """POST to Global Content OS Hub tip ingress (canonical path)."""

    def __init__(
        self,
        hub_url: str | None = None,
        token: str | None = None,
        timeout: float = 60.0,
    ):
        self.hub_url = (hub_url or os.environ.get("GCOS_HUB_URL") or "http://127.0.0.1:8787").rstrip(
            "/"
        )
        self.token = token or os.environ.get("TIP_RADAR_INGEST_TOKEN") or "dev-tip-ingest-token"
        self.timeout = timeout

    def post_telemetry(self, metrics: dict) -> tuple[bool, str]:
        """Authenticated per-source execution telemetry (never contains the token)."""
        body = json.dumps(metrics).encode("utf-8")
        req = urllib.request.Request(
            self.hub_url + "/api/ingress/hekimler-telemetry",
            data=body,
            headers={"Content-Type": "application/json", "X-Ingest-Token": self.token, "User-Agent": "hekimler-hub-bridge/1.0"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                return True, resp.read().decode("utf-8")[:200]
        except urllib.error.HTTPError as exc:
            return False, f"HTTP {exc.code}"
        except Exception as exc:  # noqa: BLE001
            return False, str(exc)[:120]

    def deliver(self, payload: HubCandidatePayload) -> HubDeliveryResult:
        err = payload.validate()
        if err:
            return HubDeliveryResult(
                ok=False, error=err, delivery_status="failed", dedupe_key=payload.dedupe_key()
            )
        body = json.dumps({"candidates": [payload.to_hub_json()]}).encode("utf-8")
        req = urllib.request.Request(
            self.hub_url + "/api/ingress/tip",
            data=body,
            headers={
                "Content-Type": "application/json",
                "X-Ingest-Token": self.token,
                "User-Agent": "hekimler-hub-bridge/1.0",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = (exc.read() or b"").decode("utf-8", errors="replace")[:500]
            return HubDeliveryResult(
                ok=False,
                error=f"HTTP {exc.code}: {detail}",
                delivery_status="failed",
                dedupe_key=payload.dedupe_key(),
            )
        except Exception as exc:  # noqa: BLE001 — delivery must stay visibly failed
            return HubDeliveryResult(
                ok=False,
                error=str(exc),
                delivery_status="failed",
                dedupe_key=payload.dedupe_key(),
            )

        if data.get("ok") is False or data.get("error"):
            return HubDeliveryResult(
                ok=False,
                error=str(data.get("error") or data),
                delivery_status="failed",
                dedupe_key=payload.dedupe_key(),
            )

        rejected = int(data.get("rejected") or 0)
        if rejected > 0:
            reasons = data.get("rejectionReasons") or []
            return HubDeliveryResult(
                ok=False,
                error=f"hub rejected: {reasons[:3]}",
                delivery_status="failed",
                dedupe_key=payload.dedupe_key(),
            )

        created = int(data.get("created") or 0)
        updated = int(data.get("updated") or 0)
        if created + updated == 0:
            return HubDeliveryResult(
                ok=False,
                error="hub returned zero created/updated (not delivered)",
                delivery_status="failed",
                dedupe_key=payload.dedupe_key(),
            )

        return HubDeliveryResult(
            ok=True,
            created=created > 0,
            updated=updated > 0,
            duplicate=updated > 0 and created == 0,
            dedupe_key=payload.dedupe_key(),
            delivery_status="delivered",
        )


def deliver_hekimler_candidate(
    payload: HubCandidatePayload,
    client: HubDeliveryClient,
) -> HubDeliveryResult:
    """Single entry: validate → deliver. Never marks success on failure."""
    return client.deliver(payload)


def build_hekimler_hub_payload(
    *,
    source_id: str,
    title: str,
    summary: str,
    source_url: str,
    primary_url: str,
    content_hash: str,
    decision: str,
    decision_route: str,
    evidence_status: str,
    audience_segments: list[str],
    routing_reason: str,
    risk_flags: list[str],
    provenance: dict[str, Any],
    fetched_at: str,
    created_at: str | None = None,
    institution: str | None = None,
    event_date: str | None = None,
    dedupe_group: str | None = None,
) -> HubCandidatePayload:
    return HubCandidatePayload(
        external_id=f"{source_id}:{content_hash[:16]}",
        title=title,
        summary=summary,
        url=primary_url or source_url,
        primary_url=primary_url or source_url,
        source_id=source_id,
        content_hash=content_hash,
        channel_id=HEKIMLER_CHANNEL_ID,
        editorial_brand=HEKIMLER_EDITORIAL_BRAND,
        content_family=HEKIMLER_CONTENT_FAMILY,
        institution=institution,
        decision=decision,
        decision_route=decision_route,
        evidence_status=evidence_status,
        source_policy_applied=source_id,
        audience_segments=list(audience_segments),
        routing_reason=routing_reason,
        risk_flags=list(risk_flags),
        provenance=dict(provenance),
        fetched_at=fetched_at,
        created_at=created_at or fetched_at,
        event_date=event_date,
        dedupe_group=dedupe_group,
        discovered_at=fetched_at,
    )
