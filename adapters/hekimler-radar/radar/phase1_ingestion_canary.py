"""Hekimler Phase 1 Ingestion Canary.

Connects Phase 1 OFFICIAL_PRIMARY profiles to the canonical Global Content OS
Hub Candidate/Review destination via `hekimler_hub_bridge` (tip ingress).

Local tip-radar SQLite is a development/fixture harness only — never treated as
deployed Hub storage.

Does NOT import or enable publishing, Hub promote, or always-on schedules.
Feature flag HEKIMLER_PHASE1_INGESTION_ENABLED defaults to false (safe no-op).

Named phase1_ingestion_canary (not hekimler_*) so decision modules remain
queue-import-free under integrity checks.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import ssl
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Callable
from urllib.parse import urljoin, urlparse

from .database import Database
from .hekimler_fetch import (
    classify_with_congress_gate,
    evaluate_fetch_result,
    evaluate_tls_failure,
    url_allowed_by_plan,
)
from .hekimler_hub_bridge import (
    HEKIMLER_CHANNEL_ID,
    HEKIMLER_CONTENT_FAMILY,
    HEKIMLER_EDITORIAL_BRAND,
    PHASE1_LIVE_ELIGIBLE_SOURCE_IDS,
    HubDeliveryClient,
    build_hekimler_hub_payload,
    deliver_hekimler_candidate,
)
from .hekimler_integrity import resolve_effective_registry
from .models import Candidate

PHASE1_CANARY_SOURCE_IDS = frozenset(
    {
        "osym_medical_exams",
        "yok_medical_education",
        "yokak_medical_accreditation",
        "tuk_specialty_training",
        "resmi_gazete_medical_regulation",
        "tuik_medical_public_health",  # keep in allowlist but MANUAL_REVIEW blocked
    }
)

EXCLUDED_FROM_CANARY_NOTE = (
    "AA, PROFESSIONAL_*, MANUAL_REVIEW-only extras, research, opportunity, abroad, trend, congress"
)

FEATURE_FLAG = "HEKIMLER_PHASE1_INGESTION_ENABLED"
# First-class Hub partition identity (not tip-ogrencileri-platformu pack slug)
CHANNEL_ID = HEKIMLER_CHANNEL_ID
EDITORIAL_BRAND = HEKIMLER_EDITORIAL_BRAND
CONTENT_FAMILY = HEKIMLER_CONTENT_FAMILY
# Tip channel pack path still hosts this canary code
CHANNEL_PACK_ID = "tip-ogrencileri-platformu"

TransportFn = Callable[[str], "TransportResult"]


@dataclass
class TransportResult:
    http_status: int | None
    body: str
    tls_ok: bool
    requested_url: str
    failure_reason: str | None = None


@dataclass
class RawItem:
    source_id: str
    source_url: str
    canonical_item_url: str
    title: str
    published_at: str | None
    fetched_at: str
    content_hash: str
    fetch_method: str
    raw_excerpt: str = ""


@dataclass
class SourceRunResult:
    source_id: str
    due: bool
    operator_status: str
    fetch_result: str | None = None
    item_count: int = 0
    accepted_count: int = 0
    discarded_count: int = 0
    duplicate_count: int = 0
    hub_delivery_failures: int = 0
    error_reason: str | None = None
    source_health: str | None = None
    last_success_at: str | None = None
    last_content_hash: str | None = None
    last_item_timestamp: str | None = None
    failure_count: int = 0
    candidate_ids: list[int] = field(default_factory=list)
    hub_item_ids: list[str] = field(default_factory=list)
    dry_run: bool = False
    commit_target: str | None = None  # hub | local_harness | None
    rejected_shape: int = 0
    rejected_audience: int = 0
    rejected_keyword: int = 0
    rejected_date: int = 0
    newest_record_date: str | None = None


@dataclass
class CanaryRunSummary:
    enabled: bool
    dry_run: bool
    commit_target: str
    results: list[SourceRunResult] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "enabled": self.enabled,
            "dry_run": self.dry_run,
            "commit_target": self.commit_target,
            "results": [r.__dict__ for r in self.results],
        }


def ingestion_enabled() -> bool:
    """Feature flag only. CLI --force must never bypass this."""
    return os.environ.get(FEATURE_FLAG, "false").strip().lower() in {"1", "true", "yes", "on"}


def hekimler_candidates_query_predicate() -> str:
    """Queryable Hub partition for Hekimler Phase 1 (not raw_analysis-only)."""
    return (
        f"channel_id = '{HEKIMLER_CHANNEL_ID}' "
        f"AND content_family = '{HEKIMLER_CONTENT_FAMILY}'"
    )


def runtime_alignment_audit() -> dict[str, Any]:
    """Static audit after Hub bridge v1 — live HTTP still gated separately."""
    return {
        "verdict": "HUB_BRIDGE_READY",
        "canonical_store": {
            "global_content_os_hub": "canonical deployed Candidate/Review destination",
            "intake_path": "POST /api/ingress/tip (global-content-os tip-radar ingress + hekimler partition)",
            "tip_radar_sqlite": "local development/fixture harness only — not production SoT",
            "assessment": "aligned",
        },
        "channel_identity": {
            "channel_id": CHANNEL_ID,
            "editorial_brand": EDITORIAL_BRAND,
            "content_family": CONTENT_FAMILY,
            "channelId_in_table_column": True,
            "editorial_brand_in_table_column": True,
            "content_family_in_table_column": True,
            "assessment": "first-class Hub columns (migration 0009)",
        },
        "separation_from_tip_student_candidates": {
            "without_raw_analysis_only": True,
            "mechanism": hekimler_candidates_query_predicate(),
        },
        "deployed_runtime_invokes_same_store": {
            "local_cli_via_hub_bridge": True,
            "hub_worker_cron": False,
            "assessment": "commit mode targets Hub bridge; no scheduler registered",
        },
        "live_eligible_sources": sorted(PHASE1_LIVE_ELIGIBLE_SOURCE_IDS),
        "blocked_sources": ["tuik_medical_public_health (MANUAL_REVIEW_REQUIRED)"],
        "live_http_allowed": False,
        "note": "Bridge implemented; do not run live dry-run until explicitly authorized.",
    }



def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _utcnow_iso() -> str:
    return _utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")


def resolve_listing_url(url: str, now: datetime | None = None) -> str:
    if "{today}" not in (url or ""):
        return url
    # Istanbul calendar date for Resmî Gazete fihrist
    from datetime import timedelta as _td

    now = now or _utcnow()
    istanbul = now + _td(hours=3)  # fixed offset sufficient for canary
    return url.replace("{today}", istanbul.strftime("%Y-%m-%d"))


def surface_is_manual_review_only(surface: dict[str, Any]) -> bool:
    return (surface.get("health") or "HEALTHY") == "MANUAL_REVIEW_REQUIRED"


def plan_is_manual_review_excluded(plan: dict[str, Any]) -> bool:
    """True when the fetch plan (or every surface) requires manual review — no HTTP."""
    if (plan.get("source_health") or "") == "MANUAL_REVIEW_REQUIRED":
        return True
    surfaces = list(plan.get("surfaces") or [])
    if surfaces and all(surface_is_manual_review_only(s) for s in surfaces):
        return True
    return False


def resolve_canary_listing_url(profile: dict[str, Any], now: datetime | None = None) -> str:
    """Prefer hardened fetch_plan surface URLs over overlay homepage primary_url.

    Never returns a MANUAL_REVIEW_REQUIRED surface URL.
    """
    plan = profile.get("fetch_plan") or {}
    surfaces = [
        s for s in (plan.get("surfaces") or [])
        if not surface_is_manual_review_only(s)
    ]
    # Prefer explicit primary / announcements roles before homepage fallbacks
    preferred = [
        s for s in surfaces
        if (s.get("role") or "").lower() in {"primary", "announcements", "daily_toc", "bulletin_discovery"}
    ]
    ordered = preferred + [s for s in surfaces if s not in preferred]
    for surface in ordered:
        url = surface.get("url")
        if url:
            return resolve_listing_url(url, now=now)
    return resolve_listing_url(
        profile.get("source_url") or profile.get("primary_url") or "",
        now=now,
    )


def select_phase1_canary_profiles(effective: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    reg = effective or resolve_effective_registry()
    out = []
    for src in reg.get("sources") or []:
        sid = src.get("source_id") or ""
        if sid not in PHASE1_CANARY_SOURCE_IDS:
            continue
        if sid.startswith("abroad_"):
            continue
        if src.get("source_tier") == "SECONDARY_NEWSWIRE":
            continue
        if src.get("source_tier") in {"PROFESSIONAL_BODY", "PROFESSIONAL_GUIDANCE"}:
            continue
        out.append(src)
    # Stable order matching PHASE1 declaration
    order = {sid: i for i, sid in enumerate(PHASE1_CANARY_SOURCE_IDS)}
    out.sort(key=lambda s: order.get(s["source_id"], 99))
    return out


def profile_is_excluded_from_canary(source_id: str) -> bool:
    if source_id in PHASE1_CANARY_SOURCE_IDS:
        return False
    return True


def is_due(
    profile: dict[str, Any],
    *,
    last_success_at: str | None,
    now: datetime | None = None,
) -> bool:
    plan = profile.get("fetch_plan") or {}
    interval = int(plan.get("expected_check_interval_minutes") or 1440)
    if not last_success_at:
        return True
    now = now or _utcnow()
    try:
        last = datetime.fromisoformat(last_success_at.replace("Z", "+00:00"))
    except ValueError:
        return True
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    return now >= last + timedelta(minutes=interval)


def _os_trust_get(url: str, timeout: float) -> TransportResult | None:
    """Verified GET through the system curl (OS trust store). Returns None when curl is unavailable/fails TLS."""
    import shutil
    import subprocess

    curl = shutil.which("curl")
    if not curl:
        return None
    try:
        proc = subprocess.run(
            [curl, "-sSL", "--max-time", str(int(timeout)), "-A", "HekimlerContinuousWorker/1.0 (+review-only)", "-w", "\n%{http_code}", url],
            capture_output=True, timeout=timeout + 10,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if proc.returncode != 0:
        return None  # includes curl TLS verification failures (exit 35/60): stay fail-closed
    raw = proc.stdout.decode("utf-8", errors="replace")
    body, _, code = raw.rpartition("\n")
    try:
        status = int(code.strip())
    except ValueError:
        return None
    return TransportResult(http_status=status, body=body, tls_ok=True, requested_url=url, failure_reason=None if status < 400 else f"HTTP {status}")


def _composite_trovanorme_get(url: str, transport, max_pages: int = 13) -> TransportResult:
    """Archive page -> the latest weekly newsletters (last ~90 days), concatenated for one parse."""
    archive = transport(url)
    if not archive.body or (archive.http_status or 0) >= 400:
        return archive
    ids = list(dict.fromkeys(re.findall(r"renderArchivioNews\?id=(news\d{8}\.htm)", archive.body)))[:max_pages]
    bodies: list[str] = []
    base = url.split("/norme/")[0]
    for nid in ids:
        r = transport(f"{base}/norme/renderArchivioNews?id={nid}")
        if r.body and (r.http_status or 0) < 400:
            bodies.append(r.body)
    return TransportResult(http_status=200 if bodies else 502, body="\n".join(bodies), tls_ok=True, requested_url=url)


def _atom_to_rss_items(body: str) -> str:
    """Normalise Atom <entry> blocks (gov.uk activity feeds) to the RSS <item> shape parsed downstream."""
    import html as _html
    from datetime import datetime as _dt
    from email.utils import format_datetime

    out = []
    for block in re.findall(r"<entry[\s>].*?</entry>", body, flags=re.S | re.I):
        t = re.search(r"<title[^>]*>(.*?)</title>", block, re.S | re.I)
        l = re.search(r"<link[^>]*?href=[\"']([^\"']+)[\"']", block, re.S | re.I)
        u = re.search(r"<(?:updated|published)[^>]*>(.*?)</(?:updated|published)>", block, re.S | re.I)
        sm = re.search(r"<summary[^>]*>(.*?)</summary>", block, re.S | re.I)
        if not t or not l:
            continue
        pub = ""
        if u:
            try:
                pub = format_datetime(_dt.fromisoformat(u.group(1).strip().replace("Z", "+00:00")))
            except ValueError:
                pub = ""
        out.append(
            f"<item><title>{t.group(1)}</title><link>{_html.escape(l.group(1))}</link>"
            f"<pubDate>{pub}</pubDate><description>{sm.group(1) if sm else ''}</description></item>"
        )
    return "\n".join(out)


def _composite_multi_feed_get(urls: list[str], transport) -> TransportResult:
    """Several official RSS/Atom feeds -> one RSS-shaped body (each item keeps its upstream canonical link)."""
    parts: list[str] = []
    for u in urls:
        r = transport(u)
        if not r.body or (r.http_status or 0) >= 400:
            continue
        parts.append(_atom_to_rss_items(r.body) if re.search(r"<entry[\s>]", r.body) else "\n".join(
            re.findall(r"<item[\s>].*?</item>", r.body, flags=re.S | re.I)))
    return TransportResult(http_status=200 if parts else 502, body="<rss><channel>" + "\n".join(parts) + "</channel></rss>", tls_ok=True, requested_url=urls[0] if urls else "")


def _tdb_news_json_to_rss(body: str, web_base: str) -> str:
    """TDB's official site publishes news through its own public JSON API (publishedAt is the real date).

    Converted to RSS-shaped items; canonical URL is the public detail page on the official site.
    """
    import html as _html
    from datetime import datetime as _dt
    from email.utils import format_datetime

    try:
        rows = json.loads(body).get("data") or []
    except (ValueError, AttributeError):
        return ""
    items = []
    for r in rows:
        title = ((r.get("title") or {}).get("tr") or "").strip()
        slug = (r.get("slug") or "").strip()
        if not title or not slug or r.get("status") not in (None, "published") or r.get("isActive") is False:
            continue
        pub = ""
        raw = r.get("publishedAt") or ""
        if raw:
            try:
                pub = format_datetime(_dt.fromisoformat(raw.replace("Z", "+00:00")))
            except ValueError:
                pub = ""
        excerpt = (r.get("excerpt") or {}).get("tr") if isinstance(r.get("excerpt"), dict) else r.get("excerpt")
        text = re.sub(r"<[^>]+>", " ", (excerpt or ((r.get("body") or {}).get("tr") or "")))
        text = re.sub(r"\s+", " ", _html.unescape(text)).strip()[:500]
        link = f"{web_base.rstrip('/')}/basin-odasi/haber-arsivi/{slug}/detay"
        items.append(
            f"<item><title>{_html.escape(title)}</title><link>{_html.escape(link)}</link>"
            f"<pubDate>{pub}</pubDate><description>{_html.escape(text)}</description></item>"
        )
    return "\n".join(items)


def _composite_tdb_news_get(api_url: str, web_base: str, transport) -> TransportResult:
    r = transport(api_url)
    if not r.body or (r.http_status or 0) >= 400:
        return r
    items = _tdb_news_json_to_rss(r.body, web_base)
    return TransportResult(
        http_status=200 if items else 502, body="<rss><channel>" + items + "</channel></rss>", tls_ok=True, requested_url=api_url
    )


# Narrow host scope for pinned public intermediates (see content/certs/README.md). A pin never applies elsewhere.
PINNED_INTERMEDIATE_HOSTS = {
    "fnmt-ac-componentes-informaticos.pem": ("universidades.gob.es",),
    "geotrust-tls-rsa-ca-g1.pem": ("resmigazete.gov.tr",),
    "sectigo-public-server-auth-ca-dv-r36.pem": ("ttb.org.tr",),
}


def _pinned_intermediates_get(url: str, timeout: float) -> TransportResult | None:
    """Verified GET that adds pinned PUBLIC intermediates (content/certs/*.pem) as an extra trust path.

    Used only after a normal verification failure. Verification stays ON (partial chain); nothing is disabled.
    """
    from pathlib import Path as _Path
    host = (urllib.parse.urlparse(url).hostname or "").lower()
    certs_dir = _Path(__file__).resolve().parents[1] / "content" / "certs"
    certs = [certs_dir / name for name, suffixes in PINNED_INTERMEDIATE_HOSTS.items()
             if any(host == x or host.endswith("." + x) for x in suffixes) and (certs_dir / name).is_file()]
    if not certs:
        return None
    ctx = ssl.create_default_context()
    for pem in certs:
        ctx.load_verify_locations(cafile=str(pem))
    ctx.verify_flags |= getattr(ssl, "VERIFY_X509_PARTIAL_CHAIN", 0)
    req = urllib.request.Request(url, headers={"User-Agent": "HekimlerContinuousWorker/1.0 (+review-only)"}, method="GET")
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=timeout) as resp:
            return TransportResult(http_status=getattr(resp, "status", 200) or 200, body=resp.read().decode("utf-8", errors="replace"), tls_ok=True, requested_url=url)
    except urllib.error.HTTPError as exc:
        return TransportResult(http_status=exc.code, body=(exc.read() or b"").decode("utf-8", errors="replace"), tls_ok=True, requested_url=url, failure_reason=f"HTTP {exc.code}")
    except Exception:  # noqa: BLE001 — stay fail-closed
        return None


def tls_verified_get(url: str, timeout: float | None = None) -> TransportResult:
    """HTTP GET with mandatory certificate verification. Never disables TLS checks."""
    timeout = float(timeout if timeout is not None else os.environ.get("HEKIMLER_HTTP_TIMEOUT") or 30.0)
    ctx = ssl.create_default_context()
    # TLS verification remains on for every canary request.
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "HekimlerContinuousWorker/1.0 (+review-only)"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=timeout) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            return TransportResult(
                http_status=getattr(resp, "status", 200) or 200,
                body=body,
                tls_ok=True,
                requested_url=url,
            )
    except ssl.SSLError as exc:
        # Some official hosts serve an incomplete chain that Python's OpenSSL cannot complete but the OS trust
        # store can (AIA fetching). curl (schannel/system trust) still VERIFIES the certificate; never disable it.
        os_result = _pinned_intermediates_get(url, timeout) or _os_trust_get(url, timeout)
        if os_result is not None:
            return os_result
        return TransportResult(
            http_status=None,
            body="",
            tls_ok=False,
            requested_url=url,
            failure_reason=f"TLS failure: {exc}",
        )
    except urllib.error.HTTPError as exc:
        return TransportResult(
            http_status=exc.code,
            body=(exc.read() or b"").decode("utf-8", errors="replace"),
            tls_ok=True,
            requested_url=url,
            failure_reason=f"HTTP {exc.code}",
        )
    except Exception as exc:  # noqa: BLE001 — fail closed
        if "CERTIFICATE_VERIFY_FAILED" in str(exc):
            os_result = _pinned_intermediates_get(url, timeout) or _os_trust_get(url, timeout)
            if os_result is not None:
                return os_result
        return TransportResult(
            http_status=None,
            body="",
            tls_ok=True,
            requested_url=url,
            failure_reason=str(exc),
        )


def _hash_text(*parts: str) -> str:
    blob = "\n".join(parts)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def _extract_body_excerpt(html_body: str, title: str) -> str:
    """Best-effort real lead-paragraph excerpt from a detail page, for listing sources whose
    card markup carries no description (raw_excerpt otherwise just repeats the title verbatim,
    which gives reviewers nothing about what the announcement actually says).

    Strips script/style/nav/header/footer/form, flattens to text, and returns the text that
    literally follows the article title in that flattened text (common CMS layout: header/nav
    render before the title, then the body) -- never generated, only text already on the page.
    Returns "" on anything uncertain; callers must fall back to the title, never guess.
    """
    import html as _html

    if not html_body or not title:
        return ""
    # <head> (<title>, <meta>) often repeats "PAGE TITLE | Org Name" -- searching there finds the
    # org-name/header text, not the article body. Only the real <body> can hold the actual lead text.
    body_start = re.search(r"<body[^>]*>", html_body, flags=re.I)
    html_body = html_body[body_start.end() :] if body_start else html_body
    stripped = re.sub(r"<(script|style|nav|header|footer|form|noscript)[\s\S]*?</\1>", " ", html_body, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", stripped)
    text = _html.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    full_title = re.sub(r"\s+", " ", title).strip()
    needle = full_title[:60]
    if len(needle) < 12:
        return ""
    idx = text.lower().find(needle.lower())
    if idx == -1:
        return ""
    # Skip past the WHOLE title when it's present verbatim at that position, not just the
    # 60-char search needle -- otherwise the tail of a long title leaks into the excerpt.
    skip = len(full_title) if text[idx : idx + len(full_title)].lower() == full_title.lower() else len(needle)
    tail = text[idx + skip : idx + skip + 2000].lstrip(" -–—|:.·")
    if len(tail) < 40:
        return ""
    m = re.match(r"(.{40,450}?[.!?])(\s|$)", tail)
    excerpt = (m.group(1) if m else tail[:400]).strip()
    # Guard against grabbing more boilerplate (short repeated menu-like fragments have few spaces per char).
    if excerpt.count(" ") < 6:
        return ""
    return excerpt


def _parse_rss_items(
    *, source_id: str, source_url: str, body: str, fetched_at: str, fetch_method: str
) -> list[RawItem]:
    """Official RSS 2.0 feed (e.g. WordPress /feed): title, link and pubDate are reliable."""
    import html as _html
    from email.utils import parsedate_to_datetime

    def _txt(raw: str) -> str:
        raw = re.sub(r"<!\[CDATA\[|\]\]>", "", raw or "")
        return re.sub(r"\s+", " ", _html.unescape(re.sub(r"<[^>]+>", " ", raw))).strip()

    out: list[RawItem] = []
    for block in re.findall(r"<item[\s>].*?</item>", body, flags=re.S | re.I):
        t = re.search(r"<title[^>]*>(.*?)</title>", block, re.S | re.I)
        l = re.search(r"<link[^>]*>(.*?)</link>", block, re.S | re.I)
        if not t or not l:
            continue
        title, link = _txt(t.group(1)), _txt(l.group(1))
        if len(title) < 8 or not link.startswith("http"):
            continue
        pub = None
        d = re.search(r"<pubDate[^>]*>(.*?)</pubDate>", block, re.S | re.I)
        if d:
            try:
                pub = parsedate_to_datetime(_txt(d.group(1))).date().isoformat()
            except (TypeError, ValueError):
                pub = None
        desc = re.search(r"<description[^>]*>(.*?)</description>", block, re.S | re.I)
        excerpt = _txt(desc.group(1))[:500] if desc else title
        out.append(
            RawItem(
                source_id=source_id,
                source_url=source_url,
                canonical_item_url=link,
                title=title,
                published_at=pub,
                fetched_at=fetched_at,
                content_hash=_hash_text(source_id, link, title),
                fetch_method=fetch_method,
                raw_excerpt=excerpt or title,
            )
        )
    return out


def _parse_news_sitemap(
    *, source_id: str, source_url: str, body: str, fetched_at: str, fetch_method: str
) -> list[RawItem]:
    """Google-News style sitemap (official structured data): loc + news:title + publication_date."""
    import html as _html

    out: list[RawItem] = []
    for block in re.findall(r"<url>.*?</url>", body, flags=re.S | re.I):
        loc = re.search(r"<loc>(.*?)</loc>", block, re.S)
        title = re.search(r"<news:title>(.*?)</news:title>", block, re.S)
        pub = re.search(r"<news:publication_date>(.*?)</news:publication_date>", block, re.S)
        if not loc or not title:
            continue
        t = re.sub(r"<!\[CDATA\[|\]\]>", "", title.group(1))
        t = re.sub(r"\s+", " ", _html.unescape(t)).strip()
        link = loc.group(1).strip()
        if len(t) < 8:
            continue
        out.append(
            RawItem(
                source_id=source_id,
                source_url=source_url,
                canonical_item_url=link,
                title=t,
                published_at=(pub.group(1).strip()[:10] if pub else None),
                fetched_at=fetched_at,
                content_hash=_hash_text(source_id, link, t),
                fetch_method=fetch_method,
                raw_excerpt=t,
            )
        )
    return out


_GENERIC_LINK_TEXT = re.compile(r"^\s*(read more|read on|continue reading|learn more|more|details?|devam[ıi]?|devam[ıi] oku|detay|t[ıi]klay[ıi]n|ayr[ıi]nt[ıi]lar)\W*$", re.I)


def _card_heading_before(body: str, pos: int) -> str | None:
    """Card layouts: the real title is the nearest heading before a generic 'Read more' link."""
    import html as _html

    window = body[max(0, pos - 1500) : pos]
    heads = re.findall(r"<h[1-5][^>]*>(.*?)</h[1-5]>", window, flags=re.S | re.I)
    if not heads:
        return None
    text = re.sub(r"\s+", " ", _html.unescape(re.sub(r"<[^>]+>", " ", heads[-1]))).strip()
    return text if len(text) >= 12 else None


_TR_MONTH_NUM = {"ocak": 1, "subat": 2, "mart": 3, "nisan": 4, "mayis": 5, "haziran": 6, "temmuz": 7, "agustos": 8, "eylul": 9, "ekim": 10, "kasim": 11, "aralik": 12}


def _parse_tuik_carousel(
    *, source_id: str, source_url: str, body: str, fetched_at: str, fetch_method: str
) -> list[RawItem]:
    """TÜİK home-page bulletin slider (server-rendered): title + reference period + bulletin URL.

    The period ('Ağustos 2026', '2025', '2. Çeyrek 2026') is the reference period, so the publication date is
    approximated by the end of that period, capped at today (annual/quarter labels can end in the future).
    """
    import calendar
    import html as _html
    from datetime import date as _date

    from .hekimler_registry import _fold

    out: list[RawItem] = []
    seen: set[str] = set()
    pattern = r"SliderUrl\('([^']+)'[^>]*>.*?hbranabaslik[^>]*>(.*?)</div>.*?hbraltbaslik[^>]*>(.*?)</div>"
    for m in re.finditer(pattern, body, flags=re.S):
        url = m.group(1).strip()
        if url in seen:
            continue
        seen.add(url)
        title = re.sub(r"\s+", " ", _html.unescape(re.sub(r"<[^>]+>", " ", m.group(2)))).strip()
        period = re.sub(r"\s+", " ", _html.unescape(re.sub(r"<[^>]+>", " ", m.group(3)))).strip()
        if len(title) < 8:
            continue
        pub = None
        pf = _fold(period)
        mm = re.search(r"(ocak|subat|mart|nisan|mayis|haziran|temmuz|agustos|eylul|ekim|kasim|aralik)\s+(20\d{2})", pf)
        qm = re.search(r"([1-4])\.?\s*ceyrek\s+(20\d{2})", pf)
        ym = re.fullmatch(r"\s*(20\d{2})\s*", pf)
        try:
            if mm:
                y, mo = int(mm.group(2)), _TR_MONTH_NUM[mm.group(1)]
                pub = _date(y, mo, calendar.monthrange(y, mo)[1])
            elif qm:
                y, mo = int(qm.group(2)), int(qm.group(1)) * 3
                pub = _date(y, mo, calendar.monthrange(y, mo)[1])
            elif ym:
                pub = _date(int(ym.group(1)), 12, 31)
        except ValueError:
            pub = None
        if pub and pub > _date.today():
            pub = _date.today()
        full = f"{title}, {period}" if period else title
        out.append(
            RawItem(
                source_id=source_id,
                source_url=source_url,
                canonical_item_url=url,
                title=full,
                published_at=pub.isoformat() if pub else None,
                fetched_at=fetched_at,
                content_hash=_hash_text(source_id, url, full),
                fetch_method=fetch_method,
                raw_excerpt=full,
            )
        )
    return out


def _parse_dated_rows(
    *, source_id: str, source_url: str, body: str, fetched_at: str, fetch_method: str
) -> list[RawItem]:
    """Server-rendered rows: <div>TITLE</div><div class="col-lg-3 ...">dd/mm/yyyy</div> (no per-row link)."""
    import hashlib
    import html as _html

    out: list[RawItem] = []
    pattern = r">([^<>]{6,220})</div>\s*<div class=\"col-lg-3[^\"]*\"[^>]*>\s*(\d{2})/(\d{2})/(20\d{2})\s*</div>"
    for m in re.finditer(pattern, body):
        title = re.sub(r"\s+", " ", _html.unescape(m.group(1))).strip()
        iso = f"{m.group(4)}-{m.group(3)}-{m.group(2)}"
        if len(title) < 8:
            continue
        key = hashlib.sha1(f"{title}|{iso}".encode("utf-8")).hexdigest()[:10]
        link = f"{source_url.split('#')[0]}#{key}"
        out.append(
            RawItem(
                source_id=source_id,
                source_url=source_url,
                canonical_item_url=link,
                title=title,
                published_at=iso,
                fetched_at=fetched_at,
                content_hash=_hash_text(source_id, link, title),
                fetch_method=fetch_method,
                raw_excerpt=title,
            )
        )
    return out


def date_exempt_run(method: str) -> bool:
    return method == "eutilities_api"


def _parse_trovanorme_newsletters(
    *, source_id: str, source_url: str, body: str, fetched_at: str, fetch_method: str
) -> list[RawItem]:
    """Ministry of Health 'Trova Norme' weekly newsletters (one or several concatenated).

    Each block <td class="singolaNorma"> has an <h4> ("dd/mm/yyyy - Category - subject" in 'In evidenza', or the
    issuing body in 'Norme della settimana'), a description paragraph and the official act link (dettaglioAtto).
    The description is the meaningful text, so the title is normalized from official metadata + description.
    """
    import html as _html
    from datetime import date as _date

    def _txt(x: str) -> str:
        return re.sub(r"\s+", " ", _html.unescape(re.sub(r"<[^>]+>", " ", re.sub(r"<!--.*?-->", " ", x, flags=re.S)))).strip()

    out: list[RawItem] = []
    parts = re.split(r"(?=<h1>\s*Newsletter del )", body)
    for part in parts:
        nm = re.search(r"Newsletter del (\d{2})/(\d{2})/(20\d{2})", part)
        if not nm:
            continue
        nl_date = f"{nm.group(3)}-{nm.group(2)}-{nm.group(1)}"
        for blk in re.findall(r'<td class="singolaNorma[^"]*">(.*?)</td>', part, flags=re.S):
            h4 = re.search(r"<h4>(.*?)</h4>", blk, re.S)
            link = re.search(r'href="[^"]*dettaglioAtto\.spring\?id=(\d+)', re.sub(r"<!--.*?-->", " ", blk, flags=re.S))
            if not h4 or not link:
                continue
            head = _txt(h4.group(1))
            paras = [ _txt(x) for x in re.findall(r"<p>(.*?)</p>", re.sub(r"<!--.*?-->", " ", blk, flags=re.S), flags=re.S) ]
            desc = " ".join(p_ for p_ in paras if p_)
            dm = re.match(r"(\d{2})/(\d{2})/(20\d{2})\s*-\s*(.+)", head)
            if dm:
                pub = f"{dm.group(3)}-{dm.group(2)}-{dm.group(1)}"
                title = dm.group(4).replace(" - ", " — ", 1)
            else:
                pub = nl_date
                act = paras[0] if paras else head
                short = desc[len(act):].strip(" -–")
                title = f"{head}: {act} — {short[:150]}".rstrip(" —")
            url = f"https://www.trovanorme.salute.gov.it/norme/dettaglioAtto.spring?id={link.group(1)}"
            full = f"{title} — {desc}"[:600]
            out.append(
                RawItem(
                    source_id=source_id,
                    source_url=source_url,
                    canonical_item_url=url,
                    title=title[:300],
                    published_at=pub,
                    fetched_at=fetched_at,
                    content_hash=_hash_text(source_id, url, title),
                    fetch_method=fetch_method,
                    raw_excerpt=full,
                )
            )
    return out


_LEAD_DATE = re.compile(r"^\s*(\d{1,2})\s+(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\s+(20\d{2})\s+(.+)$", re.S | re.I)


def _clean_title(raw: str) -> tuple[str, str | None]:
    """Unescape HTML, collapse whitespace and split a leading 'dd Month yyyy' date off the title."""
    import html as _html
    from .hekimler_dates import extract_dates as _ed

    text = re.sub(r"\s+", " ", _html.unescape(raw or "")).strip()
    m = _LEAD_DATE.match(text)
    if m:
        ds = _ed(f"{m.group(1)} {m.group(2)} {m.group(3)}")
        return m.group(4).strip(), (ds[0].isoformat() if ds else None)
    return text, None


def _norm_title_key(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (title or "").casefold())


def _adjacent_date(body: str, pos: int) -> str | None:
    """Date shown right after a list anchor (e.g. <a>title</a> <span>16/09/2026</span>), before the next anchor."""
    from .hekimler_dates import extract_dates

    tail = body[pos : pos + 200]
    cut = re.search(r"<a[\s>]", tail, flags=re.I)
    if cut:
        tail = tail[: cut.start()]
    text = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", tail)).strip()
    # Only a short, date-only label counts; a date inside a teaser sentence is usually an event date.
    if len(text) > 30:
        return None
    ds = extract_dates(text)
    return ds[0].isoformat() if ds else None


def parse_raw_items(
    *,
    source_id: str,
    source_url: str,
    body: str,
    fetch_method: str,
    fetched_at: str,
) -> list[RawItem]:
    """Normalize listing body into raw items.

    Accepts JSON fixture ``{"items":[...]}`` or simple HTML anchor lists.
    """
    body = body or ""
    if "col-lg-3 d-flex justify-content-end" in body[:4_000_000] and re.search(r"</div>\s*<div class=\"col-lg-3 d-flex justify-content-end\"[^>]*>\s*\d{2}/\d{2}/20\d{2}", body):
        rows = _parse_dated_rows(
            source_id=source_id, source_url=source_url, body=body, fetched_at=fetched_at, fetch_method=fetch_method
        )
        if rows:
            return rows
    if 'class="singolaNorma' in body and "Newsletter del " in body:
        return _parse_trovanorme_newsletters(
            source_id=source_id, source_url=source_url, body=body, fetched_at=fetched_at, fetch_method=fetch_method
        )
    if "hbranabaslik" in body and "SliderUrl(" in body:
        return _parse_tuik_carousel(
            source_id=source_id, source_url=source_url, body=body, fetched_at=fetched_at, fetch_method=fetch_method
        )
    if re.search(r"<urlset[\s>]", body[:3000], flags=re.I) and "<news:news>" in body[:6000]:
        return _parse_news_sitemap(
            source_id=source_id, source_url=source_url, body=body, fetched_at=fetched_at, fetch_method=fetch_method
        )
    if re.search(r"<rss[\s>]|<channel[\s>]", body[:2000], flags=re.I):
        return _parse_rss_items(
            source_id=source_id, source_url=source_url, body=body, fetched_at=fetched_at, fetch_method=fetch_method
        )
    items: list[RawItem] = []
    if body.lstrip().startswith("{"):
        try:
            data = json.loads(body)
            for row in data.get("items") or []:
                title = (row.get("title") or "").strip()
                if not title:
                    continue
                item_url = row.get("url") or source_url
                if item_url.startswith("/"):
                    item_url = urljoin(source_url, item_url)
                items.append(
                    RawItem(
                        source_id=source_id,
                        source_url=source_url,
                        canonical_item_url=item_url,
                        title=title,
                        published_at=row.get("published_at"),
                        fetched_at=fetched_at,
                        content_hash=_hash_text(source_id, item_url, title),
                        fetch_method=fetch_method,
                        raw_excerpt=(row.get("excerpt") or title)[:500],
                    )
                )
            return items
        except json.JSONDecodeError:
            pass

    # Minimal HTML: <a href="...">title</a>
    for match in re.finditer(
        r'<a[^>]+href=["\']([^"\']+)["\'][^>]*>(.*?)</a>',
        body,
        flags=re.I | re.S,
    ):
        href, inner = match.group(1), re.sub(r"<[^>]+>", "", match.group(2)).strip()
        if _GENERIC_LINK_TEXT.match(inner):
            inner = _card_heading_before(body, match.start()) or inner
        if len(inner) < 12 or _GENERIC_LINK_TEXT.match(inner):  # same floor as the Worker parser
            continue
        item_url = urljoin(source_url, href)
        items.append(
            RawItem(
                source_id=source_id,
                source_url=source_url,
                canonical_item_url=item_url,
                title=inner,
                published_at=_adjacent_date(body, match.end()),
                fetched_at=fetched_at,
                content_hash=_hash_text(source_id, item_url, inner),
                fetch_method=fetch_method,
                raw_excerpt=inner[:500],
            )
        )

    # Resmî Gazete fihrist / daily TOC: table-ish rows with linked titles
    if fetch_method in {"daily_toc", "daily_toc_fihrist"} and len(items) < 5:
        for match in re.finditer(
            r"<tr[^>]*>\s*<td[^>]*>.*?<a[^>]+href=[\"']([^\"']+)[\"'][^>]*>(.*?)</a>",
            body,
            flags=re.I | re.S,
        ):
            href, inner = match.group(1), re.sub(r"<[^>]+>", "", match.group(2)).strip()
            if len(inner) < 12:
                continue
            item_url = urljoin(source_url, href)
            key = _hash_text(source_id, item_url, inner)
            if any(i.content_hash == key for i in items):
                continue
            items.append(
                RawItem(
                    source_id=source_id,
                    source_url=source_url,
                    canonical_item_url=item_url,
                    title=inner,
                    published_at=None,
                    fetched_at=fetched_at,
                    content_hash=key,
                    fetch_method=fetch_method,
                    raw_excerpt=inner[:500],
                )
            )

    # YÖK / YÖKAK list cards: href + adjacent text when anchors alone are sparse
    if source_id in {"yok_medical_education", "yokak_medical_accreditation"} and len(items) < 8:
        for match in re.finditer(
            r'(?:href|data-url)=["\']([^"\']+)["\'][^>]*>?\s*([^<]{12,220})',
            body,
            flags=re.I,
        ):
            href, inner = match.group(1), re.sub(r"\s+", " ", match.group(2)).strip()
            if len(inner) < 12:
                continue
            item_url = urljoin(source_url, href)
            key = _hash_text(source_id, item_url, inner)
            if any(i.content_hash == key for i in items):
                continue
            items.append(
                RawItem(
                    source_id=source_id,
                    source_url=source_url,
                    canonical_item_url=item_url,
                    title=inner[:300],
                    published_at=None,
                    fetched_at=fetched_at,
                    content_hash=key,
                    fetch_method=fetch_method,
                    raw_excerpt=inner[:500],
                )
            )
    return items


def ensure_ingestion_schema(db: Database) -> None:
    with db.connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS hekimler_ingestion_runs (
              id INTEGER PRIMARY KEY,
              source_id TEXT NOT NULL,
              run_at TEXT NOT NULL,
              due INTEGER NOT NULL,
              fetch_result TEXT,
              item_count INTEGER NOT NULL DEFAULT 0,
              accepted_count INTEGER NOT NULL DEFAULT 0,
              discarded_count INTEGER NOT NULL DEFAULT 0,
              duplicate_count INTEGER NOT NULL DEFAULT 0,
              error_reason TEXT,
              source_health TEXT,
              last_success_at TEXT,
              last_content_hash TEXT,
              last_item_timestamp TEXT,
              failure_count INTEGER NOT NULL DEFAULT 0,
              operator_status TEXT,
              dry_run INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_hekimler_ingestion_source_time
              ON hekimler_ingestion_runs(source_id, run_at DESC)
            """
        )


def last_success_for(db: Database, source_id: str) -> tuple[str | None, str | None, int]:
    ensure_ingestion_schema(db)
    with db.connect() as conn:
        row = conn.execute(
            """SELECT last_success_at, last_content_hash, failure_count
               FROM hekimler_ingestion_runs
               WHERE source_id=? AND fetch_result='ok' AND dry_run=0
               ORDER BY run_at DESC LIMIT 1""",
            (source_id,),
        ).fetchone()
        if not row:
            return None, None, 0
        return row["last_success_at"], row["last_content_hash"], int(row["failure_count"] or 0)


def persist_run(db: Database, result: SourceRunResult, *, dry_run: bool) -> None:
    ensure_ingestion_schema(db)
    with db.connect() as conn:
        conn.execute(
            """INSERT INTO hekimler_ingestion_runs
               (source_id, run_at, due, fetch_result, item_count, accepted_count,
                discarded_count, duplicate_count, error_reason, source_health,
                last_success_at, last_content_hash, last_item_timestamp,
                failure_count, operator_status, dry_run)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                result.source_id,
                _utcnow_iso(),
                int(result.due),
                result.fetch_result,
                result.item_count,
                result.accepted_count,
                result.discarded_count,
                result.duplicate_count,
                result.error_reason,
                result.source_health,
                result.last_success_at,
                result.last_content_hash,
                result.last_item_timestamp,
                result.failure_count,
                result.operator_status,
                int(dry_run),
            ),
        )


def _build_review_candidate(profile: dict[str, Any], item: RawItem, decision: Any) -> Candidate:
    suggested_route = decision.route if decision.decision in {"ACCEPT", "NEEDS_REVIEW"} else "DISCARD"
    return Candidate(
        source_id=item.source_id,
        source_url=item.canonical_item_url,
        institution=profile.get("name") or profile.get("label") or item.source_id,
        # Keep category as content morphology/bucket — not long-term channel identity
        category="hekimler_phase1",
        title=item.title,
        summary=item.raw_excerpt or item.title,
        content_hash=item.content_hash,
        urgency_score=50,
        confidence_score=70,
        recommended_format="none",
        external_facts=[f"source_tier:{profile.get('source_tier')}"],
        risk_flags=["hekimler_phase1_canary", "editorial_review_mandatory"],
        human_review_required=True,
        draft_hook="",
        draft_caption="",
        raw_analysis={
            "channelId": CHANNEL_ID,
            "editorialBrand": EDITORIAL_BRAND,
            "contentFamily": CONTENT_FAMILY,
            "channelPackId": CHANNEL_PACK_ID,
            "decision": "NEEDS_REVIEW",
            "route": suggested_route if decision.decision != "DISCARD" else "DISCARD",
            "source_policy_applied": item.source_id,
            "evidence_status": decision.evidence_status,
            "primary_url": profile.get("primary_url") or item.canonical_item_url,
            "source_url": item.source_url,
            "canonical_item_url": item.canonical_item_url,
            "audience_segments": profile.get("audience_segments")
            or profile.get("audience_scope")
            or ["medical_student", "intern", "resident", "physician"],
            "routing_reason": decision.reason,
            "risk_flags": ["hekimler_phase1_canary"],
            "source_provenance": {
                "source_id": item.source_id,
                "source_tier": profile.get("source_tier"),
                "fetch_method": item.fetch_method,
                "fetched_at": item.fetched_at,
                "published_at": item.published_at,
                "content_hash": item.content_hash,
            },
            "created_at": item.fetched_at,
            "fetched_at": item.fetched_at,
            "auto_publish": False,
            "publication_eligible": False,
            "pipeline_stage": "candidate_review_only",
            "commit_target": "global_content_os_hub",
        },
    )


def ingest_one_source(
    profile: dict[str, Any],
    *,
    db: Database,
    dry_run: bool,
    transport: TransportFn,
    now: datetime | None = None,
    force_due: bool = False,
    hub_client: HubDeliveryClient | None = None,
    persist_local: bool = False,
) -> SourceRunResult:
    sid = profile["source_id"]
    commit_target = "none" if dry_run else ("local_harness" if persist_local and hub_client is None else "hub")
    from .hekimler_activation import ACTIVATION_AUTOMATION_READY, compute_activation_state

    if sid not in PHASE1_CANARY_SOURCE_IDS and compute_activation_state(profile) != ACTIVATION_AUTOMATION_READY:
        return SourceRunResult(
            source_id=sid,
            due=False,
            operator_status="blocked_excluded_source",
            error_reason="source not in Phase 1 canary allowlist and not AUTOMATION_READY",
            dry_run=dry_run,
            commit_target=commit_target,
        )

    plan = profile.get("fetch_plan") or {}
    last_success, last_hash, failure_count = last_success_for(db, sid)
    due = True if force_due else is_due(profile, last_success_at=last_success, now=now)
    if not due:
        return SourceRunResult(
            source_id=sid,
            due=False,
            operator_status="not_due",
            source_health=plan.get("source_health") or "HEALTHY",
            last_success_at=last_success,
            last_content_hash=last_hash,
            failure_count=failure_count,
            dry_run=dry_run,
            commit_target=commit_target,
        )

    if plan_is_manual_review_excluded(plan):
        return SourceRunResult(
            source_id=sid,
            due=True,
            operator_status="blocked_manual_review",
            fetch_result="blocked",
            error_reason="fetch_plan marked MANUAL_REVIEW_REQUIRED — no HTTP",
            source_health="MANUAL_REVIEW_REQUIRED",
            failure_count=failure_count,
            dry_run=dry_run,
            commit_target=commit_target,
        )

    method = plan.get("primary_method") or "list-page"
    if method == "eutilities_api":
        from .hekimler_pubmed_pack import fetch_approved_query_pack

        fetched_at = _utcnow_iso()
        try:
            rows = fetch_approved_query_pack(profile)
        except Exception as err:  # noqa: BLE001 — surface as DEGRADED, fail-closed
            return SourceRunResult(
                source_id=sid,
                due=True,
                operator_status="degraded",
                fetch_result="fetch_failed",
                error_reason=str(err),
                source_health="DEGRADED",
                failure_count=failure_count + 1,
                dry_run=dry_run,
                commit_target=commit_target,
            )
        items = []
        for row in rows:
            if profile.get("require_pmid") and not row.get("pmid"):
                continue
            items.append(
                RawItem(
                    source_id=sid,
                    source_url=row["url"],
                    canonical_item_url=row["url"],
                    title=row["title"],
                    published_at=row.get("published_at"),
                    fetched_at=fetched_at,
                    content_hash=_hash_text(sid, row["url"], row["title"], row.get("pmid") or ""),
                    fetch_method=method,
                    raw_excerpt=(row.get("excerpt") or row["title"])[:500],
                )
            )
        page_hash = _hash_text(json.dumps([i.canonical_item_url for i in items], ensure_ascii=False))
        listing = profile.get("source_url") or "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
        transport_result = TransportResult(200, "", True, listing)
    else:
        listing = resolve_canary_listing_url(profile, now=now)
        ok, reason = url_allowed_by_plan(listing, plan)
        if not ok:
            # Query-string listing URLs (e.g. Resmî Gazete fihrist?tarih=) — allow when host is approved
            host = (urlparse(listing).hostname or "").lower()
            allowed_hosts = {h.lower() for h in plan.get("allowed_hostnames") or []}
            if host in allowed_hosts and any(
                (urlparse(listing).path or "/").startswith(p.rstrip("*"))
                or p in (urlparse(listing).path or "/")
                or p == "/"
                for p in (plan.get("allowed_path_patterns") or ["/"])
            ):
                ok, reason = True, "ok"
        if not ok:
            return SourceRunResult(
                source_id=sid,
                due=True,
                operator_status="blocked_by_allowlist",
                fetch_result="blocked",
                error_reason=reason,
                source_health="DEGRADED",
                failure_count=failure_count + 1,
                dry_run=dry_run,
                commit_target=commit_target,
            )

        if plan.get("composite") == "multi_feed":
            allowed = {h.lower() for h in (profile.get("allowed_hostnames") or [])}
            feeds = [u for u in (plan.get("composite_urls") or []) if (urllib.parse.urlparse(u).hostname or "").lower() in allowed]
            transport_result = _composite_multi_feed_get(feeds, transport)
        elif plan.get("composite") == "tdb_news_api":
            transport_result = _composite_tdb_news_get(str(plan["api_url"]), str(plan["web_base"]), transport)
        elif plan.get("composite") == "trovanorme_weekly_newsletters":
            transport_result = _composite_trovanorme_get(listing, transport, int(plan.get("composite_max_pages") or 13))
        else:
            transport_result = transport(listing)
        if not transport_result.tls_ok:
            outcome = evaluate_tls_failure(sid, listing)
            return SourceRunResult(
                source_id=sid,
                due=True,
                operator_status="blocked_by_tls",
                fetch_result="tls_failed",
                error_reason=outcome.reason,
                source_health="DEGRADED",
                failure_count=failure_count + 1,
                dry_run=dry_run,
                commit_target=commit_target,
            )

        if transport_result.http_status is None or transport_result.http_status >= 400:
            outcome = evaluate_fetch_result(
                source_id=sid,
                surface="primary",
                requested_url=listing,
                http_status=transport_result.http_status or 599,
                tls_ok=True,
                parsed_item_count=0,
                accepted_candidate_count=0,
                discarded_candidate_count=0,
                content_hash=None,
                previous_content_hash=last_hash,
                parser_failed=False,
            )
            return SourceRunResult(
                source_id=sid,
                due=True,
                operator_status="degraded",
                fetch_result="fetch_failed",
                error_reason=transport_result.failure_reason or outcome.reason,
                source_health="DEGRADED",
                failure_count=failure_count + 1,
                dry_run=dry_run,
                commit_target=commit_target,
            )

        fetched_at = _utcnow_iso()
        items = parse_raw_items(
            source_id=sid,
            source_url=listing,
            body=transport_result.body,
            fetch_method=method,
            fetched_at=fetched_at,
        )
        page_hash = _hash_text(transport_result.body)

    if last_hash and page_hash == last_hash and not items:
        return SourceRunResult(
            source_id=sid,
            due=True,
            operator_status="no_change",
            fetch_result="ok",
            item_count=0,
            source_health="NO_CHANGE",
            last_success_at=fetched_at,
            last_content_hash=page_hash,
            failure_count=0,
            dry_run=dry_run,
            commit_target=commit_target,
        )

    accepted = 0
    discarded = 0
    duplicates = 0
    hub_failures = 0
    candidate_ids: list[int] = []
    hub_item_ids: list[str] = []
    last_item_ts = None
    delivery_error: str | None = None

    item_url_patterns = [re.compile(x) for x in (profile.get("item_url_patterns") or [])]
    item_title_patterns = [re.compile(x) for x in (profile.get("item_title_patterns") or [])]
    detail_budget = 40  # bounded detail-page date lookups per source per run
    excerpt_budget = 20  # bounded detail-page excerpt lookups per source per run (real text only, never generated)
    stale_discarded = 0
    rej_shape = rej_audience = rej_keyword = 0
    method = str(plan.get("primary_method") or "")
    # Normalise every parsed title once (entities, whitespace, leading date) BEFORE gating/dedupe/recency proof.
    group = profile.get("dedupe_group")
    for it_ in items:
        new_title, lead = _clean_title(it_.title)
        if lead and not it_.published_at:
            it_.published_at = lead
        if new_title != it_.title:
            it_.title = new_title
            it_.raw_excerpt = _clean_title(it_.raw_excerpt or new_title)[0] if it_.raw_excerpt else new_title
            it_.content_hash = _hash_text(sid, it_.canonical_item_url, new_title)
        if group:
            key = _norm_title_key(it_.title) if profile.get("dedupe_by") == "title" else (it_.canonical_item_url or "")
            it_.content_hash = _hash_text(group, key)
    # One candidate per canonical URL: list pages often carry the same link twice (card title + teaser). Keeping both
    # made the Hub row flip between two titles on every run (a D1 write each time). Keep the shortest clean title and
    # any publication date found on either copy.
    by_url: dict[str, RawItem] = {}
    for it_ in items:
        key_url = it_.canonical_item_url or ""
        keep = by_url.get(key_url)
        if keep is None:
            by_url[key_url] = it_
            continue
        if not keep.published_at and it_.published_at:
            keep.published_at = it_.published_at
        if len(it_.title) >= 12 and len(it_.title) < len(keep.title):
            keep.title, keep.raw_excerpt, keep.content_hash = it_.title, it_.raw_excerpt, it_.content_hash
    items = list(by_url.values())
    newest_dates: list = []
    month_estimates: list[str] = []
    from .hekimler_dates import extract_dates as _extract_dates

    for it0 in items:
        # Recency proof uses only publication evidence (list/detail date or a dated URL) — never dates written in the
        # title, which are usually event dates ("... in June 2027", "09-15 February 2025").
        if it0.published_at:
            newest_dates += _extract_dates(it0.published_at)
        else:
            newest_dates += _extract_dates(it0.canonical_item_url or "")
            from .hekimler_dates import extract_url_month as _url_month

            _est0 = _url_month(it0.canonical_item_url or "")
            if _est0 is not None:
                month_estimates.append(_est0[1])
    for item in items:
        # Audience gate: nav/menu links never become candidates when the source pins a post-URL shape.
        if item_url_patterns and not any(x.search(item.canonical_item_url or "") for x in item_url_patterns):
            discarded += 1
            rej_shape += 1
            continue
        if item_title_patterns and not any(x.search((item.title or "").strip()) for x in item_title_patterns):
            discarded += 1
            rej_shape += 1
            continue
        medical_impact = None
        if sid == "resmi_gazete_medical_regulation":
            medical_impact = True
        gate_body = item.raw_excerpt or ""
        if profile.get("scope_url_in_gate"):
            # Source-specific: allow URL path tokens as supplemental gate context
            # without changing global keyword lists for other sources.
            gate_body = f"{gate_body}\n{item.canonical_item_url}"
            for tok in profile.get("scope_url_keywords") or []:
                if tok and tok.lower() in (item.canonical_item_url or "").lower():
                    gate_body = f"{gate_body}\n{tok}"
        decision = classify_with_congress_gate(
            profile,
            title=item.title,
            body=gate_body,
            medical_impact_clear=medical_impact,
        )
        if decision.decision == "DISCARD":
            discarded += 1
            if decision.reason.startswith(("out_of_audience_scope", "congress")):
                rej_audience += 1
            else:
                rej_keyword += 1
            continue

        # D9 date policy: list date -> detail-page date -> URL month estimate -> otherwise discarded (see below).
        from .hekimler_dates import date_verdict, extract_page_date

        date_exempt = method == "eutilities_api"  # evidence index, not news
        verdict, item_date = date_verdict(
            sid,
            published_at=item.published_at,
            title=item.title,
            excerpt=item.raw_excerpt or "",
            url=item.canonical_item_url or "",
        )
        date_method = "listing"
        detail = None
        if verdict == "UNDATED" and not date_exempt and detail_budget > 0:
            host = (urlparse(item.canonical_item_url or "").hostname or "").lower()
            if host in {h.lower() for h in plan.get("allowed_hostnames") or []}:
                detail_budget -= 1
                detail = transport(item.canonical_item_url)
                page_date, date_method = extract_page_date(detail.body or "")
                if page_date:
                    verdict, item_date = date_verdict(sid, published_at=page_date.isoformat())
        date_precision = "day"
        if verdict == "UNDATED" and not date_exempt:
            from .hekimler_dates import extract_url_month

            est = extract_url_month(item.canonical_item_url or "")
            if est is not None:
                verdict, item_date = date_verdict(sid, published_at=est[0].isoformat())
                date_precision = "month"
                month_estimates.append(est[1])
                date_method = "url_month_estimate"
        if item_date is not None and date_method != "listing":
            newest_dates.append(item_date)
        if item_date is not None and not item.published_at and date_precision != "month":
            item.published_at = item_date.isoformat()
        # Freshness policy (user decision 2026-09-21): an item whose date cannot be established is not news.
        # Undated archive/list entries (e.g. MoH "115. Donem ... Kurasi") are discarded and counted in rejected_date,
        # never shown as fresh. Evidence-index sources (date_exempt) are unaffected.
        if verdict in ("STALE", "UNDATED") and not date_exempt:
            discarded += 1
            stale_discarded += 1
            continue
        date_unverified = False

        # Real-excerpt backfill: the listing card gave us nothing beyond the title (the common
        # case for plain <a href> listing pages), so the reviewer sees the title twice and learns
        # nothing about what the announcement says. Fetch the detail page (reusing it if already
        # fetched above for a date lookup) and pull the real lead paragraph — never generated,
        # only text literally present on the page; "" on any uncertainty leaves the title as-is.
        if (not item.raw_excerpt or item.raw_excerpt.strip() == item.title.strip()) and excerpt_budget > 0:
            host = (urlparse(item.canonical_item_url or "").hostname or "").lower()
            if host in {h.lower() for h in plan.get("allowed_hostnames") or []}:
                excerpt_body = detail.body if detail is not None and detail.body else None
                if excerpt_body is None:
                    excerpt_budget -= 1
                    detail = transport(item.canonical_item_url)
                    excerpt_body = detail.body if detail else None
                if excerpt_body:
                    found = _extract_body_excerpt(excerpt_body, item.title)
                    if found:
                        item.raw_excerpt = found

        from .hekimler_backfill import classify_backfill

        bf = classify_backfill(
            profile,
            title=item.title,
            body=gate_body,
            published_at=item.published_at,
        )
        # Age alone never drops; backfill items retained with low priority marker
        cand = _build_review_candidate(profile, item, decision)
        analysis = cand.raw_analysis
        analysis["date_verdict"] = verdict
        analysis["date_method"] = date_method
        analysis["date_precision"] = date_precision
        if date_precision == "month":
            analysis["risk_flags"] = list(analysis.get("risk_flags") or []) + ["date_estimated_month_precision"]
            cand.risk_flags = list(cand.risk_flags) + ["date_estimated_month_precision"]
        if date_unverified:
            analysis["route"] = "NEEDS_REVIEW"
            analysis["risk_flags"] = list(analysis.get("risk_flags") or []) + ["date_unverified_needs_review"]
            cand.risk_flags = list(cand.risk_flags) + ["date_unverified_needs_review"]
        analysis["backfill"] = bf.is_backfill
        analysis["review_priority"] = bf.priority
        analysis["backfill_reason"] = bf.reason
        if bf.is_backfill:
            flags = list(analysis.get("risk_flags") or [])
            flags.append("backfill_low_priority")
            analysis["risk_flags"] = flags
            cand.risk_flags = list(cand.risk_flags) + ["backfill_low_priority"]
            cand.urgency_score = min(cand.urgency_score, 25)

        if dry_run:
            accepted += 1
            last_item_ts = item.published_at or item.fetched_at
            continue

        # Production-eligible commit → canonical Hub bridge (not silent local SQLite)
        if hub_client is not None:
            payload = build_hekimler_hub_payload(
                source_id=item.source_id,
                title=cand.title,
                summary=cand.summary,
                source_url=item.source_url,
                primary_url=item.canonical_item_url,  # the item's own official URL (list page stays in source_url/provenance)
                content_hash=item.content_hash,
                decision="NEEDS_REVIEW",
                decision_route=analysis.get("route") or "NEEDS_REVIEW",
                evidence_status=analysis.get("evidence_status") or decision.evidence_status,
                audience_segments=list(analysis.get("audience_segments") or []),
                routing_reason=analysis.get("routing_reason") or decision.reason,
                risk_flags=list(analysis.get("risk_flags") or cand.risk_flags),
                provenance=dict(analysis.get("source_provenance") or {}),
                fetched_at=item.fetched_at,
                created_at=item.fetched_at,
                institution=cand.institution,
                event_date=None if date_precision == "month" else item.published_at,
                dedupe_group=group,
            )
            delivery = deliver_hekimler_candidate(payload, hub_client)
            if not delivery.delivered:
                hub_failures += 1
                delivery_error = delivery.error
                continue
            if delivery.duplicate or delivery.updated:
                duplicates += 1
            else:
                accepted += 1
            if delivery.hub_item_id:
                hub_item_ids.append(delivery.hub_item_id)
            last_item_ts = item.published_at or item.fetched_at
            # Optional local harness mirror — never the success signal for Hub
            if persist_local:
                new_id = db.save_candidate(cand)
                if new_id is not None:
                    candidate_ids.append(int(new_id))
            continue

        # Fixture-only local harness when no hub_client injected
        if persist_local:
            new_id = db.save_candidate(cand)
            if new_id is None:
                duplicates += 1
            else:
                accepted += 1
                candidate_ids.append(int(new_id))
                last_item_ts = item.published_at or item.fetched_at
            continue

        hub_failures += 1
        delivery_error = "no hub_client configured — refusing to treat local SQLite as Hub"
        continue

    outcome = evaluate_fetch_result(
        source_id=sid,
        surface="primary",
        requested_url=listing,
        http_status=transport_result.http_status or 200,
        tls_ok=True,
        parsed_item_count=len(items),
        accepted_candidate_count=accepted,
        discarded_candidate_count=discarded,
        content_hash=page_hash,
        previous_content_hash=last_hash,
        parser_failed=False,
    )

    if not newest_dates and items and not date_exempt_run(method):
        from .hekimler_dates import extract_page_date

        # Recency proof for sources whose list carries no dates: read up to 12 detail pages.
        hosts_ok = {h.lower() for h in plan.get("allowed_hostnames") or []}
        probed = 0
        seen_urls: set[str] = set()
        for it1 in items:
            u1 = it1.canonical_item_url or ""
            if u1 in seen_urls or (urlparse(u1).hostname or "").lower() not in hosts_ok:
                continue
            if item_url_patterns and not any(x.search(u1) for x in item_url_patterns):
                continue
            seen_urls.add(u1)
            try:
                pd1, _m1 = extract_page_date(transport(u1).body or "")
            except Exception:  # noqa: BLE001 — recency probe must never fail a run
                pd1 = None
            probed += 1
            if pd1:
                newest_dates.append(pd1)
            if probed >= 12:
                break
    newest_record_date = max(newest_dates).isoformat() if newest_dates else None
    if newest_record_date is None and month_estimates:
        newest_record_date = max(month_estimates) + " (estimated, month precision)"

    if hub_failures > 0 and accepted == 0:
        op = "hub_delivery_failed"
    elif accepted > 0:
        op = "candidates_emitted" if not dry_run else "candidates_emitted_dry_run"
    elif discarded > 0 and accepted == 0:
        op = "discarded_by_policy"
    elif len(items) == 0:
        op = "no_change"
    else:
        op = "no_change"

    return SourceRunResult(
        source_id=sid,
        due=True,
        operator_status=op,
        fetch_result="ok",
        item_count=len(items),
        accepted_count=accepted,
        discarded_count=discarded,
        duplicate_count=duplicates,
        hub_delivery_failures=hub_failures,
        error_reason=delivery_error,
        source_health=outcome.source_health,
        last_success_at=fetched_at,
        last_content_hash=page_hash,
        last_item_timestamp=last_item_ts,
        failure_count=0 if hub_failures == 0 else failure_count + hub_failures,
        candidate_ids=candidate_ids,
        hub_item_ids=hub_item_ids,
        dry_run=dry_run,
        commit_target=commit_target,
        rejected_shape=rej_shape,
        rejected_audience=rej_audience,
        rejected_keyword=rej_keyword,
        rejected_date=stale_discarded,
        newest_record_date=newest_record_date,
    )


def run_phase1_canary(
    *,
    db: Database,
    dry_run: bool = True,
    source_id: str | None = None,
    transport: TransportFn | None = None,
    now: datetime | None = None,
    force_due: bool = False,
    persist_runs: bool = True,
    hub_client: HubDeliveryClient | None = None,
    persist_local: bool = False,
) -> CanaryRunSummary:
    """Callable central ingestion job. Safe no-op when feature flag is off.

    ``force_due`` only skips the interval timer. It never bypasses the feature
    flag, TLS, allowlists, medical gates, or source allowlist.

    Commit mode (dry_run=False) targets the canonical Hub bridge when
    ``hub_client`` is provided. Local SQLite is never silently treated as Hub.
    """
    enabled = ingestion_enabled()
    commit_target = "none" if dry_run else ("hub" if hub_client is not None else "unconfigured")
    summary = CanaryRunSummary(enabled=enabled, dry_run=dry_run, commit_target=commit_target)
    if not enabled:
        summary.results.append(
            SourceRunResult(
                source_id="*",
                due=False,
                operator_status="feature_flag_off",
                error_reason=f"{FEATURE_FLAG} is not enabled",
                dry_run=dry_run,
                commit_target=commit_target,
            )
        )
        return summary

    if not dry_run and hub_client is None and not persist_local:
        summary.results.append(
            SourceRunResult(
                source_id="*",
                due=False,
                operator_status="hub_client_required",
                error_reason=(
                    "commit mode requires hub_client (canonical Global Content OS Hub); "
                    "refusing to treat local tip-radar SQLite as deployed store"
                ),
                dry_run=dry_run,
                commit_target="unconfigured",
            )
        )
        return summary

    ensure_ingestion_schema(db)
    db.init()
    transport = transport or tls_verified_get
    effective = resolve_effective_registry()
    profiles = select_phase1_canary_profiles(effective)

    if source_id:
        if source_id not in PHASE1_CANARY_SOURCE_IDS:
            summary.results.append(
                SourceRunResult(
                    source_id=source_id,
                    due=False,
                    operator_status="blocked_excluded_source",
                    error_reason="requested source is outside Phase 1 canary allowlist — no HTTP",
                    dry_run=dry_run,
                    commit_target=commit_target,
                )
            )
            return summary
        profiles = [p for p in profiles if p["source_id"] == source_id]

    for profile in profiles:
        assert profile["source_id"] in PHASE1_CANARY_SOURCE_IDS
        result = ingest_one_source(
            profile,
            db=db,
            dry_run=dry_run,
            transport=transport,
            now=now,
            force_due=force_due,
            hub_client=hub_client,
            persist_local=persist_local,
        )
        if persist_runs:
            persist_run(db, result, dry_run=dry_run)
        summary.results.append(result)
    return summary


def format_operator_status(summary: CanaryRunSummary) -> str:
    lines = [
        f"Hekimler Phase 1 Canary | enabled={summary.enabled} dry_run={summary.dry_run}"
        f" commit_target={summary.commit_target}",
    ]
    for r in summary.results:
        lines.append(
            f"- {r.source_id}: {r.operator_status}"
            f" items={r.item_count} accepted={r.accepted_count}"
            f" discarded={r.discarded_count} dup={r.duplicate_count}"
            f" hub_fail={r.hub_delivery_failures}"
            f" health={r.source_health}"
        )
    return "\n".join(lines)
