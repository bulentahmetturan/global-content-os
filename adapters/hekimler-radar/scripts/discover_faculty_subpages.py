"""Discover medical-faculty sub-pages that matter to students but are not
the main announcement page: dönem koordinatörlükleri / başkoordinatörlük
(ders kurulu sınav takvimleri buradan çıkar), eğitim komisyonu, kurullar,
staj/intörnlük, akademik takvim, öğrenci konseyi.

Why a dedicated script instead of reusing discover_university_suboffices:
those probe university-level SUBDOMAINS; these are PATHS under each medical
faculty's own host, and many faculty CMSes answer every unknown path with
HTTP 200 and the homepage body (a "soft 404" that no status code or title
check catches).

So each host is first fingerprinted with a deliberately nonsense path. Any
candidate whose body length matches that fingerprint is the homepage in
disguise and is rejected. Only paths that return genuinely different
content AND contain an expected keyword are reported.

Usage:
    python -m scripts.discover_faculty_subpages [--limit N] [--out FILE]
"""

from __future__ import annotations

import argparse
import json
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urlparse

import requests
import yaml
from bs4 import BeautifulSoup

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
ROOT = Path(__file__).resolve().parents[1]
SOURCES_FILE = ROOT / "sources" / "official_sources.yaml"
TIMEOUT = 12
WORKERS = 12

# Nonsense path used to fingerprint each host's soft-404 response.
SOFT404_PROBE = "/zzz-bulunmayan-sayfa-kontrol-9713"

# page_type -> (candidate paths, keywords that must appear in the content)
PAGE_TYPES: dict[str, dict] = {
    "koordinatorluk": {
        "label": "Dönem Koordinatörlükleri / Başkoordinatörlük",
        "paths": [
            "/koordinatorlukler", "/tr/koordinatorlukler", "/koordinatorluk",
            "/baskoordinatorluk", "/donem-koordinatorlukleri",
        ],
        "keywords": ["koordinatörlük", "koordinatorluk", "baş koordinatör", "dönem koordinatör"],
    },
    "kurullar": {
        "label": "Fakülte Kurulları ve Komisyonları",
        "paths": ["/kurullar", "/tr/kurullar", "/komisyonlar", "/tr/komisyonlar", "/kurullar-ve-komisyonlar"],
        "keywords": ["kurul", "komisyon"],
    },
    "akademik_takvim": {
        "label": "Akademik Takvim",
        "paths": ["/akademik-takvim", "/tr/akademik-takvim", "/akademiktakvim"],
        "keywords": ["akademik takvim", "eğitim öğretim yılı"],
    },
    "staj_intornluk": {
        "label": "Staj / İntörnlük",
        "paths": ["/staj", "/tr/staj", "/intornluk", "/staj-programi", "/donem-6"],
        "keywords": ["staj", "intörn", "internlik"],
    },
    "ogrenci_konseyi": {
        "label": "Öğrenci Konseyi / Temsilciliği",
        "paths": ["/ogrenci-konseyi", "/tr/ogrenci-konseyi", "/ogrenci-temsilciligi"],
        "keywords": ["öğrenci konseyi", "öğrenci temsilci"],
    },
}


def _text_of(response: requests.Response) -> str:
    soup = BeautifulSoup(response.content, "html.parser")
    for tag in soup(["script", "style"]):
        tag.decompose()
    return re.sub(r"\s+", " ", soup.get_text(" ", strip=True))


def fingerprint_soft404(host: str) -> int | None:
    """Length of this host's response to a path that cannot exist."""
    try:
        response = requests.get(
            f"https://{host}{SOFT404_PROBE}", timeout=TIMEOUT,
            headers={"User-Agent": UA}, allow_redirects=True,
        )
    except requests.RequestException:
        return None
    if response.status_code != 200:
        return -1  # host answers unknown paths with a real error code: good
    return len(_text_of(response))


def probe(host: str, path: str, keywords: list[str], soft404_len: int | None) -> dict | None:
    url = f"https://{host}{path}"
    try:
        response = requests.get(url, timeout=TIMEOUT, headers={"User-Agent": UA}, allow_redirects=True)
    except requests.RequestException:
        return None
    if response.status_code != 200:
        return None
    if urlparse(response.url).hostname != host:
        return None  # redirected off-host
    text = _text_of(response)
    if len(text) < 400:
        return None
    # Soft-404: this host serves its homepage for unknown paths and this
    # response is the same size, so it is almost certainly that homepage.
    if soft404_len is not None and soft404_len > 0 and abs(len(text) - soft404_len) <= 40:
        return None
    lowered = text.lower()
    matched = [kw for kw in keywords if kw in lowered]
    if not matched:
        return None
    return {"url": response.url, "length": len(text), "matched_keywords": matched}


def faculty_hosts() -> list[tuple[str, str, str]]:
    data = yaml.safe_load(SOURCES_FILE.read_text(encoding="utf-8"))
    seen: dict[str, tuple[str, str, str]] = {}
    for source in data["sources"]:
        if source.get("category") != "faculty_announcement":
            continue
        if not source["id"].startswith("tip_"):
            continue
        host = urlparse(source["url"]).hostname
        if host and host not in seen:
            seen[host] = (source["id"], source.get("institution", ""), host)
    return list(seen.values())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--types", nargs="*", default=list(PAGE_TYPES))
    parser.add_argument("--out", default=str(ROOT / "sources" / "_faculty_subpage_report.json"))
    args = parser.parse_args()

    hosts = faculty_hosts()
    if args.limit:
        hosts = hosts[: args.limit]
    print(f"Fingerprinting soft-404 for {len(hosts)} faculty hosts...")

    fingerprints: dict[str, int | None] = {}
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(fingerprint_soft404, host): host for _, _, host in hosts}
        for future in as_completed(futures):
            fingerprints[futures[future]] = future.result()

    jobs = []
    for source_id, institution, host in hosts:
        for page_type in args.types:
            spec = PAGE_TYPES[page_type]
            for path in spec["paths"]:
                jobs.append((source_id, institution, host, page_type, path))

    print(f"Probing {len(jobs)} candidate URLs...")
    found: dict[str, dict] = {}
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {
            pool.submit(probe, host, path, PAGE_TYPES[pt]["keywords"], fingerprints.get(host)):
                (sid, inst, host, pt)
            for sid, inst, host, pt, path in jobs
        }
        done = 0
        for future in as_completed(futures):
            sid, inst, host, page_type = futures[future]
            done += 1
            if done % 100 == 0:
                print(f"  {done}/{len(jobs)}...")
            result = future.result()
            if result:
                key = f"{sid}:{page_type}"
                found.setdefault(key, {
                    "faculty_source_id": sid,
                    "institution": inst,
                    "page_type": page_type,
                    "label": PAGE_TYPES[page_type]["label"],
                    **result,
                })

    out_path = Path(args.out)
    out_path.write_text(
        json.dumps(sorted(found.values(), key=lambda r: (r["faculty_source_id"], r["page_type"])),
                   ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Confirmed {len(found)} faculty sub-pages across {len(hosts)} faculties.")
    print(f"Report: {out_path}")


if __name__ == "__main__":
    main()
