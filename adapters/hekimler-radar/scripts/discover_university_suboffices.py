"""Discover university sub-office pages (SKS, Erasmus/international office,
BAP, TTO, career center) that matter to medical students beyond the faculty
announcement page itself.

Pattern mirrors verify_faculty_urls.py: generate plausible candidate URLs per
university host using common Turkish university naming conventions, HTTP GET
each one, and only accept a candidate whose live page title/body text
contains an expected keyword for that office type. A 200 status alone is not
enough (custom 404 pages often return 200) — the keyword match is the real
verification step, consistent with CLAUDE.md's "gerçek URL doğrulanmadan
yazılmaz" rule: nothing is written to official_sources.yaml here directly,
this only produces a report for human/LLM review before merging.

Usage:
    python -m scripts.discover_university_suboffices [--limit N] [--out FILE]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests
from bs4 import BeautifulSoup
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent))
from verify_faculty_urls import FACULTIES  # noqa: E402

UA = "TipOgrencileriRadar/0.1 (+editorial-monitoring)"
ROOT = Path(__file__).resolve().parents[1]
TIMEOUT = 12
WORKERS = 12

# Soft-404: sunucu HTTP 200 döner ama gerçekte "sayfa bulunamadı" gösterir.
# Sitenin genel şablonu (nav/footer) hâlâ hedef anahtar kelimeyi
# içerebildiğinden (ör. menüde "Erasmus" linki), salt keyword eşleşmesi
# bunu yakalayamaz — başlıkta bu ifadelerden biri varsa reddet.
NOT_FOUND_MARKERS = [
    "sayfa bulunamadı", "sayfa bulunamadi", "404", "not found",
    "page not found", "aradığınız sayfa", "üzgünüz",
]

# office_id -> (candidate path templates, keyword list for content verification)
# {host} is substituted with the university's bare domain (e.g. hacettepe.edu.tr).
OFFICE_TYPES: dict[str, dict] = {
    "sks": {
        "label": "Sağlık Kültür ve Spor Daire Başkanlığı",
        "candidates": [
            "https://sks.{host}/",
            "https://sksdb.{host}/",
            "https://www.{host}/sks",
            "https://{host}/sks",
        ],
        "keywords": ["sağlık kültür ve spor", "sksdb", "sağlık, kültür ve spor"],
    },
    "erasmus": {
        "label": "Uluslararası İlişkiler / Erasmus Koordinatörlüğü",
        "candidates": [
            "https://erasmus.{host}/",
            "https://uidb.{host}/",
            "https://international.{host}/",
            "https://www.{host}/erasmus",
            "https://uluslararasi.{host}/",
        ],
        "keywords": ["erasmus", "uluslararası ilişkiler", "international relations", "uidb"],
    },
    "bap": {
        "label": "Bilimsel Araştırma Projeleri Koordinatörlüğü (BAP)",
        "candidates": [
            "https://bap.{host}/",
            "https://bapko.{host}/",
            "https://www.{host}/bap",
        ],
        "keywords": ["bilimsel araştırma projeleri", "bap koordinasyon", "proje koordinasyon"],
    },
    "tto": {
        "label": "Teknoloji Transfer Ofisi (TTO)",
        "candidates": [
            "https://tto.{host}/",
            "https://www.{host}/tto",
        ],
        "keywords": ["teknoloji transfer ofisi", "tto"],
    },
    "kariyer": {
        "label": "Kariyer Merkezi",
        "candidates": [
            "https://kariyer.{host}/",
            "https://kariyermerkezi.{host}/",
            "https://www.{host}/kariyer",
        ],
        "keywords": ["kariyer merkezi", "career center", "career development"],
    },
    "hastane": {
        "label": "Üniversite Hastanesi / Eğitim ve Araştırma Hastanesi",
        "candidates": [
            "https://hastane.{host}/",
            "https://tipfakultesihastanesi.{host}/",
            "https://www.{host}/hastane",
        ],
        "keywords": ["araştırma hastanesi", "eğitim ve araştırma hastanesi", "uygulama ve araştırma hastanesi", "üniversite hastanesi"],
    },
    "ogrenci_isleri": {
        "label": "Öğrenci İşleri / Öğrenci Dekanlığı",
        "candidates": [
            "https://oidb.{host}/",
            "https://ogrenciisleri.{host}/",
            "https://www.{host}/ogrenci-isleri",
        ],
        "keywords": ["öğrenci işleri", "öğrenci dekanlığı", "oidb"],
    },
    "etik_kurul": {
        "label": "Klinik Araştırmalar Etik Kurulu",
        "candidates": [
            "https://etik.{host}/",
            "https://etikkurul.{host}/",
            "https://www.{host}/etik-kurul",
        ],
        "keywords": ["etik kurul", "klinik araştırmalar etik", "girişimsel olmayan"],
    },
    "surekli_egitim": {
        "label": "Sürekli Eğitim Merkezi (SEM)",
        "candidates": [
            "https://sem.{host}/",
            "https://surekliegitim.{host}/",
            "https://www.{host}/sem",
        ],
        "keywords": ["sürekli eğitim merkezi", "sürekli eğitim uygulama"],
    },
    "kutuphane": {
        "label": "Kütüphane",
        "candidates": [
            "https://kutuphane.{host}/",
            "https://library.{host}/",
            "https://www.{host}/kutuphane",
        ],
        "keywords": ["kütüphane", "library", "elektronik kaynaklar"],
    },
    "burs_ofisi": {
        "label": "Burs ve Öğrenci Destek Ofisi",
        "candidates": [
            "https://burs.{host}/",
            "https://www.{host}/burs",
            "https://ogrencidestek.{host}/",
        ],
        "keywords": ["burs", "öğrenci destek", "scholarship"],
    },
    "arastirma_merkezleri": {
        "label": "Araştırma ve Uygulama Merkezleri",
        "candidates": [
            "https://www.{host}/arastirma-merkezleri",
            "https://arastirma.{host}/",
            "https://www.{host}/arastirma-uygulama-merkezleri",
        ],
        "keywords": ["araştırma merkezi", "araştırma ve uygulama merkez", "uygulama ve araştırma merkez"],
    },
}
# Not: "araştırma merkezleri" (üniversite başına çok sayıda, farklı isimli
# merkez) ve "öğrenci topluluklarının sosyal medya hesapları" (HTTP sayfa
# deseni yok, ayrı bir sosyal medya API entegrasyonu gerektirir) bu kör
# alt-domain tarama yöntemine uygun değil — kasıtlı olarak atlandı.


def probe(url: str, keywords: list[str]) -> dict | None:
    try:
        response = requests.get(url, headers={"User-Agent": UA}, timeout=TIMEOUT, allow_redirects=True)
    except requests.RequestException as exc:
        return {"url": url, "ok": False, "error": str(exc)[:150]}
    if response.status_code != 200:
        return {"url": url, "ok": False, "error": f"status={response.status_code}"}
    requested_host = urlparse(url).hostname or ""
    final_host = urlparse(response.url).hostname or ""
    if requested_host != final_host:
        # Subdomain candidate silently redirected to a different host
        # (typically a wildcard DNS catch-all pointing back at the main
        # site) — not a real dedicated page, reject regardless of keywords.
        return {"url": url, "ok": False, "error": f"redirected_off_host:{final_host}"}
    soup = BeautifulSoup(response.content, "html.parser")
    title_text = soup.title.get_text(" ", strip=True) if soup.title else ""
    title_norm = re.sub(r"\s+", " ", title_text).lower()
    if any(marker in title_norm for marker in NOT_FOUND_MARKERS):
        # Soft-404: sayfa 200 döner ama başlığı "sayfa bulunamadı" der.
        # Site şablonu (nav/footer) hâlâ hedef kelimeyi taşıyabildiğinden
        # gövde metnine bakmadan, başlık kontrolüyle burada eleniyor.
        return {"url": url, "ok": False, "error": f"soft_404:{title_text[:80]}", "final_url": response.url}
    text = title_text + " " + soup.get_text(" ", strip=True)[:3000]
    text_norm = re.sub(r"\s+", " ", text).lower()
    matched = [kw for kw in keywords if kw in text_norm]
    if not matched:
        return {"url": url, "ok": False, "error": "no_keyword_match", "final_url": response.url}
    return {"url": url, "ok": True, "final_url": response.url, "matched_keywords": matched}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None, help="only process first N universities")
    parser.add_argument("--offices", nargs="*", default=list(OFFICE_TYPES), help="subset of office types")
    parser.add_argument("--out", default=str(ROOT / "sources" / "_suboffice_probe_report.json"))
    args = parser.parse_args()

    universities = FACULTIES[: args.limit] if args.limit else FACULTIES
    jobs = []
    for uni in universities:
        for office_id in args.offices:
            spec = OFFICE_TYPES[office_id]
            for template in spec["candidates"]:
                jobs.append((uni, office_id, template.format(host=uni["host"])))

    print(f"Probing {len(jobs)} candidate URLs across {len(universities)} universities...")
    results: dict[str, dict] = {}
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {
            pool.submit(probe, url, OFFICE_TYPES[office_id]["keywords"]): (uni, office_id, url)
            for uni, office_id, url in jobs
        }
        done = 0
        for future in as_completed(futures):
            uni, office_id, url = futures[future]
            done += 1
            if done % 50 == 0:
                print(f"  {done}/{len(jobs)}...")
            outcome = future.result()
            if outcome and outcome.get("ok"):
                key = f"{uni['id']}:{office_id}"
                # keep the first confirmed match per (university, office_type)
                results.setdefault(key, {
                    "university_id": uni["id"],
                    "institution": uni["institution"],
                    "office_id": office_id,
                    "office_label": OFFICE_TYPES[office_id]["label"],
                    **outcome,
                })

    out_path = Path(args.out)
    out_path.write_text(
        json.dumps(sorted(results.values(), key=lambda r: (r["university_id"], r["office_id"])), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Confirmed {len(results)} sub-office pages out of {len(universities)} universities x {len(args.offices)} office types.")
    print(f"Report written to {out_path}")


if __name__ == "__main__":
    main()
