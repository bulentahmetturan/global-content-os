"""Merge central sources with HTTP-verified faculty listing pages."""

from __future__ import annotations

from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]

REJECT_SUBSTRINGS = (
    "adiyaman.edu.tr",  # redirected to university home, not faculty
    "beyaz-onluk",
)

EXTRA = [
    {
        "id": "tip_istanbul_ogrenci_duyuru",
        "name": "İstanbul Üniversitesi İstanbul Tıp Fakültesi öğrenci duyuruları",
        "institution": "İstanbul Üniversitesi",
        "faculty": "İstanbul Tıp Fakültesi",
        "category": "faculty_announcement",
        "url": "https://ogrenci-istanbultip.istanbul.edu.tr/tr/duyurular/1/3",
        "source_type": "html",
        "official": True,
        "enabled": True,
        "check_every_minutes": 1440,
        "notes": "JS ağırlıklı; mevcut HTML toplayıcı kısa metin dönebilir.",
    },
    {
        "id": "tip_cerrahpasa_ogrenci_duyuru",
        "name": "İstanbul Üniversitesi-Cerrahpaşa Cerrahpaşa Tıp Fakültesi öğrenci duyuruları",
        "institution": "İstanbul Üniversitesi-Cerrahpaşa",
        "faculty": "Cerrahpaşa Tıp Fakültesi",
        "category": "faculty_announcement",
        "url": "https://cerrahpasa.iuc.edu.tr/tr/duyurular/3/1",
        "source_type": "html",
        "official": True,
        "enabled": True,
        "check_every_minutes": 1440,
        "notes": "JS ağırlıklı; mevcut HTML toplayıcı kısa metin dönebilir.",
    },
    {
        "id": "tip_koc_duyuru",
        "name": "Koç Üniversitesi Tıp Fakültesi",
        "institution": "Koç Üniversitesi",
        "faculty": "Tıp Fakültesi",
        "category": "faculty_announcement",
        "url": "https://medicine.ku.edu.tr/",
        "source_type": "html",
        "official": True,
        "enabled": True,
        "check_every_minutes": 1440,
        "notes": "Radar User-Agent ile 403 görüldü; tarayıcıda içerik doğrulandı.",
    },
    {
        "id": "tip_pau_duyuru",
        "name": "Pamukkale Üniversitesi Tıp Fakültesi duyuruları",
        "institution": "Pamukkale Üniversitesi",
        "faculty": "Tıp Fakültesi",
        "category": "faculty_announcement",
        "url": "https://www.pau.edu.tr/tip",
        "source_type": "html",
        "official": True,
        "enabled": True,
        "check_every_minutes": 1440,
        "notes": "WAF/bot koruması var; düz HTTP toplayıcı 503 alabilir.",
    },
]

UNVERIFIED = [
    "Acıbadem Mehmet Ali Aydınlar Üniversitesi Tıp Fakültesi",
    "Afyonkarahisar Sağlık Bilimleri Üniversitesi Tıp Fakültesi",
    "Ağrı İbrahim Çeçen Üniversitesi Tıp Fakültesi",
    "Amasya Üniversitesi Tıp Fakültesi",
    "Altınbaş Üniversitesi Tıp Fakültesi",
    "Ankara Medipol Üniversitesi Tıp Fakültesi",
    "Bahçeşehir Üniversitesi Tıp Fakültesi",
    "Bezmialem Vakıf Üniversitesi Tıp Fakültesi",
    "Demiroğlu Bilim Üniversitesi Tıp Fakültesi",
    "Düzce Üniversitesi Tıp Fakültesi",
    "Gaziosmanpaşa Üniversitesi Tıp Fakültesi",
    "Hatay Mustafa Kemal Üniversitesi Tayfur Ata Sökmen Tıp Fakültesi",
    "İnönü Üniversitesi Tıp Fakültesi",
    "İstanbul Aydın Üniversitesi Tıp Fakültesi",
    "İstinye Üniversitesi Tıp Fakültesi",
    "İzmir Kâtip Çelebi Üniversitesi Tıp Fakültesi",
    "Kafkas Üniversitesi Tıp Fakültesi",
    "Kırıkkale Üniversitesi Tıp Fakültesi",
    "Kocaeli Üniversitesi Tıp Fakültesi",
    "KTO Karatay Üniversitesi Tıp Fakültesi",
    "Lokman Hekim Üniversitesi Tıp Fakültesi",
    "Mersin Üniversitesi Tıp Fakültesi",
    "Necmettin Erbakan Üniversitesi Meram Tıp Fakültesi",
    "Niğde Ömer Halisdemir Üniversitesi — ayrı duyuru yolu doğrulanamadı (genel sayfa var: ohu tipfakultesi eklendi ise çıkar)",
    "Ordu Üniversitesi Tıp Fakültesi",
    "Recep Tayyip Erdoğan Üniversitesi Tıp Fakültesi",
    "Selçuk Üniversitesi Tıp Fakültesi",
    "Trakya Üniversitesi Tıp Fakültesi",
    "Ufuk Üniversitesi Tıp Fakültesi",
    "Uşak Üniversitesi Tıp Fakültesi",
    "Van Yüzüncü Yıl Üniversitesi Tıp Fakültesi",
    "Yüksek İhtisas Üniversitesi Tıp Fakültesi",
    "SBU Adana / Bursa / Erzurum / Gülhane / Hamidiye / Hamidiye Uluslararası / İzmir / Trabzon kampüs sayfaları — ortak https://tip.sbu.edu.tr/ doğrulandı, kampüs URL ayrı doğrulanmadı",
]


def strip_notes(item: dict) -> dict:
    return {k: v for k, v in item.items() if k != "notes"}


def main() -> None:
    central = yaml.safe_load((ROOT / "sources" / "official_sources.yaml").read_text(encoding="utf-8"))
    central_sources = [s for s in central["sources"] if not str(s["id"]).startswith("tip_")]
    verified = yaml.safe_load((ROOT / "sources" / "faculty_verified.yaml").read_text(encoding="utf-8"))
    faculty = []
    seen_urls = set()
    for item in verified["sources"]:
        url = item["url"].rstrip("/")
        if any(bad in item["url"] for bad in REJECT_SUBSTRINGS):
            continue
        if url in {"https://www.lokmanhekim.edu.tr", "https://lokmanhekim.edu.tr"}:
            continue
        if item["url"] in seen_urls:
            continue
        seen_urls.add(item["url"])
        faculty.append(item)
    for extra in EXTRA:
        if extra["url"] not in seen_urls:
            faculty.append(strip_notes(extra))
            seen_urls.add(extra["url"])
    faculty.sort(key=lambda s: s["institution"] + s["id"])
    out = {"sources": central_sources + faculty}
    text = yaml.safe_dump(out, allow_unicode=True, sort_keys=False)
    (ROOT / "sources" / "official_sources.yaml").write_text(text, encoding="utf-8")
    inv = {
        "unverified_or_blocked": UNVERIFIED,
        "fetcher_limitations": [
            "İstanbul Tıp ve Cerrahpaşa öğrenci duyuru sayfaları JS ağırlıklı.",
            "Koç medicine.ku.edu.tr tarayıcıda doğrulandı, radar UA 403.",
            "PAÜ WAF 503 döndü; URL arama sonucuyla doğrulandı.",
        ],
    }
    (ROOT / "sources" / "faculty_unverified.yaml").write_text(
        yaml.safe_dump(inv, allow_unicode=True, sort_keys=False), encoding="utf-8"
    )
    print("central", len(central_sources), "faculty", len(faculty), "total", len(out["sources"]))


if __name__ == "__main__":
    main()
