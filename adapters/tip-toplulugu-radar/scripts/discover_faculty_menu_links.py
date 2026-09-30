"""Find student-critical faculty pages by reading each medical faculty's own
navigation menu, instead of guessing URL paths.

discover_faculty_subpages.py guesses paths like /kurullar or /koordinatorlukler
and only matched 18 of 89 faculties, because faculty CMSes use wildly
different URL schemes (/tr/page/123, /icerik/45/kurullar, ?menu_id=17 ...).

This script instead fetches each faculty's announcement page, walks every
<a> element, and keeps links whose VISIBLE TEXT names something a medical
student needs — dönem koordinatörlüğü (ders kurulu sınav takvimleri),
eğitim komisyonu / kurullar, akademik takvim, staj / intörnlük, sınav
takvimi, öğrenci konseyi. The URL shape is irrelevant; the anchor text is
the signal.

Guards:
  - link must stay on the same host (no off-site menu links)
  - anchor text must be short enough to be a menu label, not a news headline
  - the same target URL is reported once per faculty

Usage:
    python -m scripts.discover_faculty_menu_links [--limit N] [--out FILE]
"""

from __future__ import annotations

import argparse
import json
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
import yaml
from bs4 import BeautifulSoup

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
ROOT = Path(__file__).resolve().parents[1]
SOURCES_FILE = ROOT / "sources" / "official_sources.yaml"
TIMEOUT = 15
WORKERS = 10

# Menu labels are short; a long anchor is a news headline, not a nav item.
MAX_ANCHOR_LEN = 60

# A menu link points at a standing PAGE that keeps getting updated. A link
# into a single news/announcement item is a one-off that will never change
# again, so it is noise for a change-detection radar. Faculty CMSes mark
# these in the path (…/haber/…, …/duyuru/…, Bandırma's …/d/…) or in the
# anchor text ("… Yayınlandı", "… Hakkında Duyuru").
NEWS_PATH_MARKERS = ("/haber/", "/haberler/", "/duyuru/", "/duyurular/", "/news/",
                     "/article/", "/icerik-detay/", "/d/")
NEWS_TEXT_MARKERS = ("yayinlandi", "yayimlandi", "hakkinda", "duyurusu", "bulusmasi",
                     "toplantisi", "hk.", "sonuclari")

# page_type -> phrases that may appear in the anchor text (normalised)
LINK_PATTERNS: dict[str, dict] = {
    "koordinatorluk": {
        "label": "Dönem Koordinatörlükleri / Başkoordinatörlük",
        "phrases": ["koordinatorluk", "koordinatorlukler", "bas koordinator", "donem koordinator"],
    },
    "sinav_takvimi": {
        "label": "Sınav Takvimi / Ders Kurulu Programı",
        "phrases": ["sinav takvimi", "sinav programi", "ders kurulu", "ders programi", "ders kurullari"],
    },
    "kurullar": {
        "label": "Kurullar ve Komisyonlar",
        "phrases": ["kurullar", "komisyonlar", "egitim komisyonu", "kurul ve komisyon"],
    },
    "akademik_takvim": {
        "label": "Akademik Takvim",
        "phrases": ["akademik takvim"],
    },
    "staj_intornluk": {
        "label": "Staj / İntörnlük",
        "phrases": ["staj", "intornluk", "intorn", "donem 6", "donem vi"],
    },
}

_TR = str.maketrans({"ı": "i", "İ": "i", "ş": "s", "Ş": "s", "ğ": "g", "Ğ": "g",
                     "ü": "u", "Ü": "u", "ö": "o", "Ö": "o", "ç": "c", "Ç": "c"})


def normalise(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").translate(_TR).lower()).strip()


def faculty_pages() -> list[tuple[str, str, str]]:
    data = yaml.safe_load(SOURCES_FILE.read_text(encoding="utf-8"))
    out, seen = [], set()
    for source in data["sources"]:
        if source.get("category") != "faculty_announcement":
            continue
        if not source["id"].startswith("tip_"):
            continue
        if any(source["id"].endswith(sfx) for sfx in
               ("_koordinatorluk", "_kurullar", "_akademik_takvim", "_staj_intornluk",
                "_ogrenci_konseyi", "_sinav_takvimi")):
            continue  # already-added sub-page, not a faculty root
        if source["id"] in seen:
            continue
        seen.add(source["id"])
        out.append((source["id"], source.get("institution", ""), source["url"]))
    return out


def harvest(source_id: str, institution: str, url: str) -> list[dict]:
    try:
        response = requests.get(url, timeout=TIMEOUT, headers={"User-Agent": UA}, allow_redirects=True)
    except requests.RequestException:
        return []
    if response.status_code != 200:
        return []
    host = urlparse(response.url).hostname
    soup = BeautifulSoup(response.content, "html.parser")

    found: dict[str, dict] = {}
    for anchor in soup.find_all("a", href=True):
        text = anchor.get_text(" ", strip=True)
        if not text or len(text) > MAX_ANCHOR_LEN:
            continue
        norm = normalise(text)
        target = urljoin(response.url, anchor["href"])
        parsed = urlparse(target)
        if parsed.scheme not in ("http", "https") or parsed.hostname != host:
            continue
        if target.rstrip("/") == response.url.rstrip("/"):
            continue
        lowered_path = parsed.path.lower()
        if any(marker in lowered_path for marker in NEWS_PATH_MARKERS):
            continue  # link into a single news item, not a standing page
        if any(marker in norm for marker in NEWS_TEXT_MARKERS):
            continue
        for page_type, spec in LINK_PATTERNS.items():
            if any(phrase in norm for phrase in spec["phrases"]):
                key = f"{page_type}:{target}"
                found.setdefault(key, {
                    "faculty_source_id": source_id,
                    "institution": institution,
                    "page_type": page_type,
                    "label": spec["label"],
                    "anchor_text": text,
                    "url": target,
                })
                break
    return list(found.values())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--out", default=str(ROOT / "sources" / "_faculty_menu_report.json"))
    args = parser.parse_args()

    faculties = faculty_pages()
    if args.limit:
        faculties = faculties[: args.limit]
    print(f"Reading navigation menus of {len(faculties)} faculty pages...")

    results: list[dict] = []
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = [pool.submit(harvest, sid, inst, url) for sid, inst, url in faculties]
        done = 0
        for future in as_completed(futures):
            done += 1
            if done % 20 == 0:
                print(f"  {done}/{len(faculties)}...")
            results.extend(future.result())

    out_path = Path(args.out)
    out_path.write_text(
        json.dumps(sorted(results, key=lambda r: (r["faculty_source_id"], r["page_type"])),
                   ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    covered = len({r["faculty_source_id"] for r in results})
    print(f"Found {len(results)} candidate links across {covered}/{len(faculties)} faculties.")
    print(f"Report: {out_path}")


if __name__ == "__main__":
    main()
