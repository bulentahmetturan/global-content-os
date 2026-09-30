"""Probe remaining faculty listing URLs found via search; add only HTTP-verified pages."""

from __future__ import annotations

import json
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

UA = "TipOgrencileriRadar/0.1 (+editorial-monitoring)"
ROOT = Path(__file__).resolve().parents[1]
TIMEOUT = 22

CANDIDATES: list[tuple[str, str, str, str]] = [
    ("amasya", "Amasya Üniversitesi", "Tıp Fakültesi", "https://tip.amasya.edu.tr/"),
    ("yyu", "Van Yüzüncü Yıl Üniversitesi", "Tıp Fakültesi", "https://www.yyu.edu.tr/Birimler/14"),
    ("kafkas", "Kafkas Üniversitesi", "Tıp Fakültesi", "https://www.kafkas.edu.tr/Tipfak"),
    ("acibadem", "Acıbadem Mehmet Ali Aydınlar Üniversitesi", "Tıp Fakültesi", "https://www.acibadem.edu.tr/tip-fakultesi"),
    ("altinbas", "Altınbaş Üniversitesi", "Tıp Fakültesi", "https://altinbas.edu.tr/akademik/fakulteler/tip/"),
    ("istinye", "İstinye Üniversitesi", "Tıp Fakültesi", "https://www.istinye.edu.tr/tr/tip"),
    ("erbakan", "Necmettin Erbakan Üniversitesi", "Meram Tıp Fakültesi", "https://www.erbakan.edu.tr/meramtip"),
    ("sbu_gulhane", "Sağlık Bilimleri Üniversitesi", "Gülhane Tıp Fakültesi", "https://gulhanetip.sbu.edu.tr/"),
    ("ikc", "İzmir Kâtip Çelebi Üniversitesi", "Tıp Fakültesi", "https://tip.ikcu.edu.tr/"),
    ("afsu", "Afyonkarahisar Sağlık Bilimleri Üniversitesi", "Tıp Fakültesi", "https://www.afsu.edu.tr/tip-fakultesi"),
    ("afsu2", "Afyonkarahisar Sağlık Bilimleri Üniversitesi", "Tıp Fakültesi", "https://tip.afsu.edu.tr/"),
    ("agri", "Ağrı İbrahim Çeçen Üniversitesi", "Tıp Fakültesi", "https://www.agri.edu.tr/akademik/fakulteler/tip-fakultesi"),
    ("agri2", "Ağrı İbrahim Çeçen Üniversitesi", "Tıp Fakültesi", "https://tip.agri.edu.tr/"),
    ("ankara_medipol", "Ankara Medipol Üniversitesi", "Tıp Fakültesi", "https://www.ankaramedipol.edu.tr/akademik/fakulteler/tip-fakultesi"),
    ("ankara_medipol2", "Ankara Medipol Üniversitesi", "Tıp Fakültesi", "https://ankaramedipol.edu.tr/tip-fakultesi"),
    ("bau", "Bahçeşehir Üniversitesi", "Tıp Fakültesi", "https://www.bau.edu.tr/akademik-birimler/tip-fakultesi"),
    ("bau2", "Bahçeşehir Üniversitesi", "Tıp Fakültesi", "https://medicine.bau.edu.tr/"),
    ("bau3", "Bahçeşehir Üniversitesi", "Tıp Fakültesi", "https://bau.edu.tr/content/tip-fakultesi"),
    ("bezmialem", "Bezmialem Vakıf Üniversitesi", "Tıp Fakültesi", "https://tip.bezmialem.edu.tr/"),
    ("bezmialem2", "Bezmialem Vakıf Üniversitesi", "Tıp Fakültesi", "https://www.bezmialem.edu.tr/tr/akademik/fakulteler/tip-fakultesi"),
    ("demiroglu", "Demiroğlu Bilim Üniversitesi", "Tıp Fakültesi", "https://www.demiroglu.edu.tr/akademik/tip-fakultesi"),
    ("demiroglu2", "Demiroğlu Bilim Üniversitesi", "Tıp Fakültesi", "https://www.istanbulbilim.edu.tr/tip-fakultesi"),
    ("duzce", "Düzce Üniversitesi", "Tıp Fakültesi", "https://tip.duzce.edu.tr/"),
    ("duzce2", "Düzce Üniversitesi", "Tıp Fakültesi", "https://www.duzce.edu.tr/akademik/fakulteler/tip-fakultesi"),
    ("gop", "Tokat Gaziosmanpaşa Üniversitesi", "Tıp Fakültesi", "https://www.gop.edu.tr/BirimDetay.aspx?BirimID=14"),
    ("gop2", "Tokat Gaziosmanpaşa Üniversitesi", "Tıp Fakültesi", "https://tip.gop.edu.tr/"),
    ("mku", "Hatay Mustafa Kemal Üniversitesi", "Tayfur Ata Sökmen Tıp Fakültesi", "https://www.mku.edu.tr/dekanlik.aspx?dekanlikNo=21"),
    ("mku2", "Hatay Mustafa Kemal Üniversitesi", "Tayfur Ata Sökmen Tıp Fakültesi", "https://tip.mku.edu.tr/"),
    ("inonu", "İnönü Üniversitesi", "Tıp Fakültesi", "https://www.inonu.edu.tr/tip"),
    ("inonu2", "İnönü Üniversitesi", "Tıp Fakültesi", "https://tip.inonu.edu.tr/"),
    ("aydin", "İstanbul Aydın Üniversitesi", "Tıp Fakültesi", "https://www.aydin.edu.tr/tr-tr/akademik/fakulteler/tip/Pages/index.aspx"),
    ("aydin2", "İstanbul Aydın Üniversitesi", "Tıp Fakültesi", "https://www.aydin.edu.tr/tr/akademik/fakulteler/tip-fakultesi"),
    ("kku", "Kırıkkale Üniversitesi", "Tıp Fakültesi", "https://tip.kku.edu.tr/"),
    ("kku2", "Kırıkkale Üniversitesi", "Tıp Fakültesi", "https://www.kku.edu.tr/tip"),
    ("kocaeli", "Kocaeli Üniversitesi", "Tıp Fakültesi", "http://tip.kocaeli.edu.tr/"),
    ("kocaeli2", "Kocaeli Üniversitesi", "Tıp Fakültesi", "https://tip.kocaeli.edu.tr/"),
    ("karatay", "KTO Karatay Üniversitesi", "Tıp Fakültesi", "https://www.karatay.edu.tr/tr/akademik/fakulteler/tip-fakultesi"),
    ("lokmanhekim", "Lokman Hekim Üniversitesi", "Tıp Fakültesi", "https://www.lokmanhekim.edu.tr/akademik/fakulteler/tip-fakultesi"),
    ("mersin", "Mersin Üniversitesi", "Tıp Fakültesi", "https://www.mersin.edu.tr/idari/akademik/fakulteler/tip-fakultesi"),
    ("mersin2", "Mersin Üniversitesi", "Tıp Fakültesi", "https://www.mersin.edu.tr/akademik/fakulteler/tip-fakultesi"),
    ("mersin3", "Mersin Üniversitesi", "Tıp Fakültesi", "https://tip.mersin.edu.tr/"),
    ("odu", "Ordu Üniversitesi", "Tıp Fakültesi", "https://tip.odu.edu.tr/"),
    ("odu2", "Ordu Üniversitesi", "Tıp Fakültesi", "https://www.odu.edu.tr/akademik/fakulteler/tip-fakultesi"),
    ("erdogan", "Recep Tayyip Erdoğan Üniversitesi", "Tıp Fakültesi", "https://www.erdogan.edu.tr/tip-fakultesi"),
    ("erdogan2", "Recep Tayyip Erdoğan Üniversitesi", "Tıp Fakültesi", "https://tip.erdogan.edu.tr/"),
    ("erdogan3", "Recep Tayyip Erdoğan Üniversitesi", "Tıp Fakültesi", "https://www.erdogan.edu.tr/tr/akademik/fakulteler/tip-fakultesi"),
    ("selcuk", "Selçuk Üniversitesi", "Tıp Fakültesi", "https://www.selcuk.edu.tr/tip_fakultesi"),
    ("selcuk2", "Selçuk Üniversitesi", "Tıp Fakültesi", "https://www.selcuk.edu.tr/Birim/tip-fakultesi"),
    ("selcuk3", "Selçuk Üniversitesi", "Tıp Fakültesi", "https://tip.selcuk.edu.tr/"),
    ("trakya", "Trakya Üniversitesi", "Tıp Fakültesi", "https://tip.trakya.edu.tr/"),
    ("trakya2", "Trakya Üniversitesi", "Tıp Fakültesi", "https://www.trakya.edu.tr/tip-fakultesi"),
    ("ufuk", "Ufuk Üniversitesi", "Tıp Fakültesi", "https://www.ufuk.edu.tr/akademik/tip-fakultesi"),
    ("ufuk2", "Ufuk Üniversitesi", "Tıp Fakültesi", "https://www.ufuk.edu.tr/tr/akademik/fakulteler/tip-fakultesi"),
    ("usak", "Uşak Üniversitesi", "Tıp Fakültesi", "https://tip.usak.edu.tr/"),
    ("usak2", "Uşak Üniversitesi", "Tıp Fakültesi", "https://www.usak.edu.tr/akademik/fakulteler/tip-fakultesi"),
    ("yuksekihtisas", "Yüksek İhtisas Üniversitesi", "Tıp Fakültesi", "https://www.yuksekihtisas.edu.tr/akademik/fakulteler/tip-fakultesi"),
    ("yuksekihtisas2", "Yüksek İhtisas Üniversitesi", "Tıp Fakültesi", "https://www.yuksekihtisas.edu.tr/tip-fakultesi"),
]


def faculty_like(url: str, title: str, text: str) -> bool:
    blob = f"{url} {title} {text[:4000]}".lower()
    if "404" in url.lower():
        return False
    host = urlparse(url).netloc.lower()
    path = urlparse(url).path.lower()
    if host.startswith(("tip.", "med.", "medicine.", "gulhanetip.")):
        return True
    if any(x in path for x in ("/tip", "tipfak", "tıp", "meram", "medicine", "fakulteler/tip")):
        return True
    return "tıp fakültesi" in blob or "faculty of medicine" in blob


def fetch(url: str) -> dict:
    headers = {"User-Agent": UA, "Accept-Language": "tr-TR,tr;q=0.9"}
    last_err = None
    for verify in (True, False):
        try:
            response = requests.get(url, headers=headers, timeout=TIMEOUT, allow_redirects=True, verify=verify)
            last_err = None
            break
        except requests.RequestException as exc:
            last_err = exc
            response = None
            if "SSL" not in type(exc).__name__ and "SSL" not in str(exc):
                break
    if last_err is not None or response is None:
        return {"ok": False, "url": url, "error": type(last_err).__name__, "detail": str(last_err)[:160]}
    if response.status_code != 200:
        return {"ok": False, "url": url, "status": response.status_code, "final": response.url}
    soup = BeautifulSoup(response.text, "html.parser")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    title = soup.title.get_text(" ", strip=True) if soup.title else ""
    text = re.sub(r"\s+", " ", soup.get_text(" ", strip=True))
    if len(text) < 80:
        return {"ok": False, "url": url, "error": "too_short", "final": response.url, "title": title[:120], "n": len(text)}
    if not faculty_like(response.url, title, text):
        return {"ok": False, "url": url, "error": "not_faculty", "final": response.url, "title": title[:120]}
    return {"ok": True, "url": url, "final": response.url, "title": title[:200], "text_len": len(text)}


def main() -> None:
    hits = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futs = {pool.submit(fetch, row[3]): row for row in CANDIDATES}
        for fut in as_completed(futs):
            fid, inst, faculty, url = futs[fut]
            result = fut.result()
            result.update({"id": fid, "institution": inst, "faculty": faculty})
            hits.append(result)
            mark = "OK" if result.get("ok") else "NO"
            print(mark, fid, result.get("final") or result.get("error"), result.get("status", ""), flush=True)
    (ROOT / "sources" / "remaining_probe.json").write_text(
        json.dumps(hits, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    ok = [h for h in hits if h.get("ok")]
    print("ok", len(ok), "fail", len(hits) - len(ok))


if __name__ == "__main__":
    main()
