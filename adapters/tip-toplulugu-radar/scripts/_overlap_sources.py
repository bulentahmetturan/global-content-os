"""Find same-source overlap across Haber / Research / Duyuru / Burs / Egitim."""
from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
ARCHIVE = ROOT / "content" / "archive"
HUB = ROOT.parents[1] / "apps" / "hub"

from radar.tip_toplulugu_integrity import resolve_effective_registry  # noqa: E402


def loadj(p: Path):
    return json.loads(p.read_text(encoding="utf-8-sig"))


def host(url: str) -> str:
    if not url:
        return ""
    u = urlparse(url if "://" in url else "https://" + url)
    h = (u.netloc or "").lower()
    if h.startswith("www."):
        h = h[4:]
    return h


def slug(name: str) -> str:
    s = (name or "").lower()
    s = re.sub(r"[^a-z0-9ğüşıöçâîûéèäöü]+", " ", s)
    return " ".join(s.split())


def src_url(s: dict) -> str:
    return s.get("source_url") or s.get("canonical_url") or s.get("primary_url") or s.get("endpoint_url") or s.get("url") or ""


rows = []

news = loadj(ARCHIVE / "_audit_feeds_news.json")["feeds"]
research = loadj(ARCHIVE / "_audit_feeds_research.json")["feeds"]
for f in news:
    rows.append({"cat": "haber", "id": f["id"], "name": f["label"], "url": f.get("endpoint_url") or "", "host": host(f.get("endpoint_url") or "")})
for f in research:
    rows.append({"cat": "research", "id": f["id"], "name": f["label"], "url": f.get("endpoint_url") or "", "host": host(f.get("endpoint_url") or "")})

eff = resolve_effective_registry()["sources"]
for s in eff:
    sid = s["source_id"]
    if sid.startswith("burs_"):
        cat = "burs"
    elif sid.startswith("egitim_"):
        cat = "egitim"
    else:
        cat = "duyuru"
    u = src_url(s)
    rows.append({"cat": cat, "id": sid, "name": s.get("name") or sid, "url": u, "host": host(u)})

# host overlap across cats
by_host = defaultdict(list)
for r in rows:
    if r["host"]:
        by_host[r["host"]].append(r)

print("=== HOST in 2+ categories ===")
for h, items in sorted(by_host.items()):
    cats = {i["cat"] for i in items}
    if len(cats) < 2:
        continue
    print(h, "->", sorted(cats))
    for i in items:
        print("   ", i["cat"], i["id"], "|", i["name"][:70])

# name token overlap (institution keywords)
print("\n=== NAME token family overlap ===")
families = [
    ("medpage", "medpage"),
    ("medical news today", "medicalnewstoday|medical news today"),
    ("medical xpress", "medical xpress|medicalxpress"),
    ("stat news", r"\bstat\b"),
    ("healthline", "healthline"),
    ("newswise", "newswise"),
    ("pubmed", "pubmed"),
    ("ema ", r"\bema\b|european medicines"),
    ("titck", "titck"),
    ("tuik", "tüik|tuik"),
    ("hsgm", "hsgm|halk sağlığı genel"),
    ("resmi gazete", "resmî gazete|resmi gazete"),
    ("sağlık bakanlığı", "sağlık bakanlığı|saglik.gov"),
    ("eular", "eular"),
    ("espen", "espen"),
    ("eha ", r"\beha\b|hematology association"),
    ("fens", r"\bfens\b"),
    ("eso ", r"\beso\b|european school of oncology"),
    ("esso", r"\besso\b"),
    ("eau ", r"\beau\b|european association of urology"),
    ("esaic", "esaic"),
    ("ers ", r"\bers\b|european respiratory"),
    ("febs", r"\bfebs\b"),
    ("who ", r"\bwho\b|openwho|who academy"),
    ("harvard", "harvard|hmx|hms"),
    ("cleveland", "cleveland"),
    ("ifm", r"\bifm\b|institute for functional"),
    ("world physio", "world physio"),
    ("fip", r"\bfip\b"),
    ("esc ", r"\besc\b"),
    ("esmo", "esmo"),
    ("ean ", r"\bean\b"),
]
for label, pat in families:
    rx = re.compile(pat, re.I)
    hits = [r for r in rows if rx.search(r["name"]) or rx.search(r["id"]) or rx.search(r["url"])]
    cats = {h["cat"] for h in hits}
    if len(cats) >= 2:
        print(label, "->", sorted(cats), "n=", len(hits))
        for h in hits:
            print("   ", h["cat"], h["id"])
