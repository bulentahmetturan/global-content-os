"""Audit the five Hub category source lists. Writes JSON only."""
from __future__ import annotations

import json
import ssl
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from radar.tip_toplulugu_integrity import resolve_effective_registry  # noqa: E402

ARCHIVE = ROOT / "content" / "archive"
HUB = ROOT.parents[1] / "apps" / "hub"
WORKER_COVERAGE = ROOT.parents[1] / "apps" / "worker" / "src" / "ingress" / "tip-toplulugu-coverage.ts"
OUT = ARCHIVE / "_source_list_audit.json"
UA = "Mozilla/5.0 (compatible; GCOS-source-audit/1.0)"
NOW = datetime(2026, 9, 24, 21, 0, tzinfo=timezone.utc)


def loadj(path: Path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def parse_ts(v: str | None):
    if not v:
        return None
    try:
        return datetime.fromisoformat(v.replace("Z", "+00:00"))
    except ValueError:
        return None


def overdue(last_fetched: str | None, poll_minutes: int) -> bool:
    ts = parse_ts(last_fetched)
    if not ts or not poll_minutes:
        return False
    age_min = (NOW - ts).total_seconds() / 60
    return age_min > max(poll_minutes * 2, 180)


def probe(url: str) -> dict:
    if not url:
        return {"http": None, "ok": False, "note": "no_url"}
    ctx = ssl.create_default_context()
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=10, context=ctx) as r:
            code = getattr(r, "status", 200)
            return {"http": code, "ok": 200 <= int(code) < 400, "note": "head"}
    except urllib.error.HTTPError as e:
        code = int(e.code)
        if code in (403, 401, 429, 503):
            return {"http": code, "ok": False, "note": "blocked_or_challenge"}
        if code in (405, 501):
            return probe_get(url)
        return {"http": code, "ok": 200 <= code < 400, "note": "http_error"}
    except ssl.SSLError as e:
        return {"http": None, "ok": False, "note": f"ssl:{e.__class__.__name__}"}
    except Exception as e:
        msg = str(e).lower()
        if "timed out" in msg or "timeout" in msg:
            return {"http": None, "ok": False, "note": "timeout"}
        if "getaddrinfo" in msg or "name or service" in msg or "nodename" in msg:
            return {"http": None, "ok": False, "note": "nxdomain"}
        return {"http": None, "ok": False, "note": e.__class__.__name__}


def probe_get(url: str) -> dict:
    ctx = ssl.create_default_context()
    req = urllib.request.Request(url, method="GET", headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=12, context=ctx) as r:
            code = getattr(r, "status", 200)
            return {"http": code, "ok": 200 <= int(code) < 400, "note": "get"}
    except urllib.error.HTTPError as e:
        code = int(e.code)
        if code in (403, 401, 429, 503):
            return {"http": code, "ok": False, "note": "blocked_or_challenge"}
        return {"http": code, "ok": False, "note": "http_error"}
    except Exception as e:
        return {"http": None, "ok": False, "note": e.__class__.__name__}


def ts_ids(path: Path, const_name: str) -> list[str]:
    text = path.read_text(encoding="utf-8")
    start = text.index(const_name)
    chunk = text[start : text.index("] as const", start)]
    return [line.strip().strip("',") for line in chunk.splitlines() if line.strip().startswith("'")]


def kaduse_verdict(feed: dict) -> tuple[str, str]:
    err = feed.get("last_error")
    enabled = int(feed.get("enabled") or 0) == 1
    ok_items = int(feed.get("last_ok_items") or 0)
    last = feed.get("last_fetched_at")
    poll = int(feed.get("poll_minutes") or 1440)
    transport = str(feed.get("transport") or "")
    if not enabled:
        return "FAIL", "enabled=0 — listede kapalı"
    if err in (None, "", "null"):
        if overdue(last, poll):
            return "HUMAN_REQUIRED", f"cadence gecikmesi (poll {poll} dk, son çekim {last})"
        return "PASS", "son çekim hatasız"
    if err == "no_items_extracted" and ok_items > 0:
        return "PASS", "kaynak çalışıyor; bu tick boş extract (Bible 8.3 izole)"
    if err == "no_items_extracted":
        return "FAIL", "extract boş ve last_ok_items=0"
    if any(x in str(err) for x in ("403", "401", "202", "cloudflare", "challenge")):
        return "HUMAN_REQUIRED", f"erişim/challenge: {err}"
    if transport == "PENDING_MANUAL" and ok_items > 0:
        return "HUMAN_REQUIRED", f"PENDING_MANUAL + hata {err}"
    return "FAIL", f"fetch hata: {err}"


def duyuru_verdict(src: dict, tel: dict | None) -> tuple[str, str]:
    label = (tel or {}).get("label") or src.get("coverage") or ""
    health = src.get("source_health") or (tel or {}).get("source_health")
    activation = src.get("runtime_activation") or ""
    if label == "FAILED_INTERNAL":
        return "FAIL", "FAILED_INTERNAL"
    if label == "RUNNER_REQUIRED":
        return "HUMAN_REQUIRED", "geo/runner — Bible 7.4 reddetmez"
    if label == "PARTIALLY_COVERED":
        return "HUMAN_REQUIRED", "kısmi kapsam — listede kalır, tam çekim değil"
    if label in ("PIPELINE_OK", "PIPELINE_OK_EMPTY", "PIPELINE_OK_LIMITED"):
        return "PASS", label
    if health == "HEALTHY":
        return "PASS", "registry HEALTHY"
    if activation == "MANUAL_INTAKE":
        return "HUMAN_REQUIRED", "MANUAL_INTAKE"
    if not tel:
        return "UNKNOWN", "telemetry yok"
    return "HUMAN_REQUIRED", f"label={label or 'yok'} health={health or 'yok'}"


def burs_egitim_verdict(src: dict, in_hub: bool, in_worker: bool, probe_r: dict) -> tuple[str, str]:
    notes = []
    if not in_hub:
        return "FAIL", "registry'de var, Hub katalogda yok"
    if not in_worker:
        notes.append("worker ID listesinde yok")
    url = src.get("source_url") or src.get("canonical_url") or src.get("primary_url") or ""
    if not url:
        return "FAIL", "canonical URL yok"
    note = probe_r.get("note") or ""
    http = probe_r.get("http")
    if probe_r.get("ok"):
        base = "kayıtlı + URL açık + MANUAL_INTAKE (Bible 7.4 fetch yok = FAIL değil)"
        if notes:
            return "HUMAN_REQUIRED", base + " · " + "; ".join(notes)
        return "PASS", base
    if note in ("blocked_or_challenge",) or http in (403, 401, 429, 503):
        return "HUMAN_REQUIRED", f"anti-bot/HTTP {http} — bypass yok (Bible 8.2)"
    if note.startswith("ssl"):
        return "HUMAN_REQUIRED", f"TLS: {note}"
    if note in ("timeout",):
        return "HUMAN_REQUIRED", "timeout"
    if note in ("nxdomain", "no_url"):
        return "FAIL", note
    if http == 404:
        return "FAIL", "HTTP 404"
    if http and 400 <= int(http) < 600:
        return "FAIL", f"HTTP {http}"
    return "FAIL", note or "url unreachable"


def main() -> None:
    news = loadj(ARCHIVE / "_audit_feeds_news.json")["feeds"]
    research = loadj(ARCHIVE / "_audit_feeds_research.json")["feeds"]
    hek_api = {s["sourceId"]: s for s in loadj(ARCHIVE / "_audit_hek_sources.json").get("sources", [])}
    hub_burs = {s["id"]: s for s in loadj(HUB / "burs-sources.json")}
    hub_egitim = {s["id"]: s for s in loadj(HUB / "egitim-sources.json")}
    worker_burs = set(ts_ids(WORKER_COVERAGE, "TIP_TOPLULUGU_BURS_SOURCE_IDS"))
    worker_egitim = set(ts_ids(WORKER_COVERAGE, "TIP_TOPLULUGU_EGITIM_SOURCE_IDS"))
    effective = resolve_effective_registry()
    sources = effective["sources"]

    duyuru = [s for s in sources if not str(s["source_id"]).startswith(("burs_", "egitim_"))]
    burs = [s for s in sources if str(s["source_id"]).startswith("burs_")]
    egitim = [s for s in sources if str(s["source_id"]).startswith("egitim_")]

    url_jobs: list[tuple[str, str]] = []
    for s in burs + egitim:
        url_jobs.append((s["source_id"], s.get("source_url") or s.get("canonical_url") or s.get("primary_url") or ""))
    for s in duyuru:
        url_jobs.append((s["source_id"], s.get("source_url") or s.get("canonical_url") or s.get("primary_url") or s.get("primary_source_url") or ""))

    probes: dict[str, dict] = {}
    with ThreadPoolExecutor(max_workers=10) as ex:
        futs = {ex.submit(probe, url): sid for sid, url in url_jobs if url}
        for fut in as_completed(futs):
            probes[futs[fut]] = fut.result()

    rows = []
    for f in news:
        v, why = kaduse_verdict(f)
        rows.append(
            {
                "category": "haber",
                "id": f["id"],
                "name": f["label"],
                "url": f.get("endpoint_url") or "",
                "verdict": v,
                "why": why,
                "mode": f.get("transport"),
            }
        )
    for f in research:
        v, why = kaduse_verdict(f)
        rows.append(
            {
                "category": "research",
                "id": f["id"],
                "name": f["label"],
                "url": f.get("endpoint_url") or "",
                "verdict": v,
                "why": why,
                "mode": f.get("transport"),
            }
        )
    for s in duyuru:
        sid = s["source_id"]
        v, why = duyuru_verdict(s, hek_api.get(sid))
        rows.append(
            {
                "category": "duyuru",
                "id": sid,
                "name": s.get("name") or sid,
                "url": s.get("source_url") or s.get("canonical_url") or s.get("primary_url") or "",
                "verdict": v,
                "why": why,
                "mode": s.get("runtime_activation") or s.get("source_health"),
            }
        )
    hub_burs_extra = set(hub_burs) - {s["source_id"] for s in burs}
    hub_egitim_extra = set(hub_egitim) - {s["source_id"] for s in egitim}
    for extra_id in sorted(hub_burs_extra):
        rows.append(
            {
                "category": "burs",
                "id": extra_id,
                "name": hub_burs[extra_id].get("name") or extra_id,
                "url": hub_burs[extra_id].get("url") or "",
                "verdict": "FAIL",
                "why": "Hub katalogda var, registry'de yok",
                "mode": "HUB_ORPHAN",
            }
        )
    for extra_id in sorted(hub_egitim_extra):
        rows.append(
            {
                "category": "egitim",
                "id": extra_id,
                "name": hub_egitim[extra_id].get("name") or extra_id,
                "url": hub_egitim[extra_id].get("url") or "",
                "verdict": "FAIL",
                "why": "Hub katalogda var, registry'de yok",
                "mode": "HUB_ORPHAN",
            }
        )
    for s in burs:
        sid = s["source_id"]
        v, why = burs_egitim_verdict(s, sid in hub_burs, sid in worker_burs, probes.get(sid) or {"ok": False, "note": "no_url"})
        rows.append(
            {
                "category": "burs",
                "id": sid,
                "name": s.get("name") or sid,
                "url": s.get("source_url") or s.get("canonical_url") or "",
                "verdict": v,
                "why": why,
                "mode": s.get("runtime_activation"),
            }
        )
    for s in egitim:
        sid = s["source_id"]
        v, why = burs_egitim_verdict(s, sid in hub_egitim, sid in worker_egitim, probes.get(sid) or {"ok": False, "note": "no_url"})
        rows.append(
            {
                "category": "egitim",
                "id": sid,
                "name": s.get("name") or sid,
                "url": s.get("source_url") or s.get("canonical_url") or "",
                "verdict": v,
                "why": why,
                "mode": s.get("runtime_activation"),
            }
        )

    summary = {}
    for cat in ("haber", "research", "duyuru", "burs", "egitim"):
        subset = [r for r in rows if r["category"] == cat]
        summary[cat] = {
            "n": len(subset),
            "PASS": sum(1 for r in subset if r["verdict"] == "PASS"),
            "FAIL": sum(1 for r in subset if r["verdict"] == "FAIL"),
            "HUMAN_REQUIRED": sum(1 for r in subset if r["verdict"] == "HUMAN_REQUIRED"),
            "UNKNOWN": sum(1 for r in subset if r["verdict"] == "UNKNOWN"),
        }

    payload = {
        "audited_at": "2026-09-24T21:00:00Z",
        "bible_version": "3.0",
        "rubric": "derived_from_bible_7_1_7_4_8_2_19_24_34",
        "bible_has_binary_source_list_pass_fail": False,
        "summary": summary,
        "hub_display_bugs": [
            "Haber açıkken Eğitim katalog paneli (hekLane sızıntısı)",
            "Research rozeti/inbox Haber sayısı kaçırıyor olabilir (aynı sızıntı)",
            "Eğitim açıkken Burs katalog paneli",
            "Burs 'Kaynak durumu (81)' Duyuru telemetrisi",
        ],
        "rows": rows,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print("wrote", OUT)


if __name__ == "__main__":
    main()
