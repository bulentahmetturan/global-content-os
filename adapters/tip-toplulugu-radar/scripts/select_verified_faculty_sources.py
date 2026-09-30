"""Second pass: listing pages only. Reject university-wide noise and article URLs."""

from __future__ import annotations

import json
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urlparse

import requests
import yaml
from bs4 import BeautifulSoup

UA = "TipOgrencileriRadar/0.1 (+editorial-monitoring)"
ROOT = Path(__file__).resolve().parents[1]
TIMEOUT = 20

# Search-confirmed or first-pass faculty hosts, listing URLs only.
LISTINGS: dict[str, list[str]] = {
    "adiyaman": ["https://tip.adiyaman.edu.tr/", "https://www.adiyaman.edu.tr/tr/akademik/fakulteler/tip-fakultesi"],
    "afsu": ["https://tip.afsu.edu.tr/", "https://www.afsu.edu.tr/tip-fakultesi"],
    "agri": ["https://tip.agri.edu.tr/", "https://www.agri.edu.tr/tip-fakultesi"],
    "akdeniz": ["https://tip.akdeniz.edu.tr/tr", "https://tip.akdeniz.edu.tr/"],
    "aksaray": ["https://tip.aksaray.edu.tr/duyurular", "https://tip.aksaray.edu.tr/"],
    "alanya": ["https://tip.alanya.edu.tr/duyuru/", "https://tip.alanya.edu.tr/"],
    "amasya": ["https://tip.amasya.edu.tr/"],
    "ankara": ["https://www.medicine.ankara.edu.tr/duyurular/", "https://www.medicine.ankara.edu.tr/"],
    "aybu": ["https://www.aybu.edu.tr/tip"],
    "atauni": ["https://atauni.edu.tr/tip-fakultesi/", "https://tip.atauni.edu.tr/"],
    "adu": ["https://fakulte.adu.edu.tr/med/", "https://tip.adu.edu.tr/"],
    "balikesir": ["https://tip.balikesir.edu.tr/duyurular", "https://tip.balikesir.edu.tr/"],
    "bandirma": ["https://tip.bandirma.edu.tr/tr/tip/Duyuru/Liste?k=-1", "https://tip.bandirma.edu.tr/"],
    "ibu": ["https://tip.ibu.edu.tr/tr/news", "https://tip.ibu.edu.tr/"],
    "uludag": ["https://www.uludag.edu.tr/tip/duyuru", "https://www.uludag.edu.tr/tip"],
    "comu": ["https://tip.comu.edu.tr/arsiv/duyurular", "https://tip.comu.edu.tr/"],
    "cu": ["https://tip.cu.edu.tr/"],
    "dicle": ["https://www.dicle.edu.tr/tr/birimler/tip-fakultesi", "https://tip.dicle.edu.tr/"],
    "deu": ["https://tip.deu.edu.tr/", "https://tip.deu.edu.tr/duyurular/"],
    "duzce": ["https://tip.duzce.edu.tr/", "https://www.duzce.edu.tr/tip"],
    "ege": ["https://med.ege.edu.tr/"],
    "erciyes": ["https://tip.erciyes.edu.tr/tr/duyuru/tum-duyurular", "https://tip.erciyes.edu.tr/"],
    "erzincan": ["https://tip.ebyu.edu.tr/", "https://www.ebyu.edu.tr/tip", "https://tip.erzincan.edu.tr/"],
    "ogu": ["https://tip.ogu.edu.tr/Duyuru/Index", "https://tip.ogu.edu.tr/"],
    "firat": ["https://tip.firat.edu.tr/"],
    "gazi": ["https://med.gazi.edu.tr/"],
    "gantep": ["https://tip.gantep.edu.tr/"],
    "gibtu": ["https://www.gibtu.edu.tr/Birim.aspx?id=20", "https://tip.gibtu.edu.tr/"],
    "giresun": ["https://tip.giresun.edu.tr/"],
    "hacettepe": ["https://tip.hacettepe.edu.tr/tr/duyurular", "https://tip.hacettepe.edu.tr/"],
    "harran": ["https://www.harran.edu.tr/akademik/fakulteler/tip-fakultesi", "https://tip.harran.edu.tr/"],
    "mku": ["https://tip.mku.edu.tr/", "https://www.mku.edu.tr/tip-fakultesi"],
    "hitit": ["https://tip.hitit.edu.tr/"],
    "inonu": ["https://tip.inonu.edu.tr/", "https://www.inonu.edu.tr/tip"],
    "medeniyet": ["https://tip.medeniyet.edu.tr/", "https://www.medeniyet.edu.tr/tr/tip-fakultesi"],
    "istanbul_tip": [
        "https://ogrenci-istanbultip.istanbul.edu.tr/tr/duyurular/1/3",
        "https://istanbultip.istanbul.edu.tr/",
    ],
    "cerrahpasa": [
        "https://cerrahpasa.iuc.edu.tr/tr/duyurular/3/1",
        "https://cerrahpasa.iuc.edu.tr/tr/duyurular/1/1",
        "https://cerrahpasa.iuc.edu.tr/",
    ],
    "bakircay": ["https://tip.bakircay.edu.tr/"],
    "idu": ["https://tip.idu.edu.tr/"],
    "ikc": ["https://tip.ikc.edu.tr/", "https://tip.ikcu.edu.tr/", "https://www.ikc.edu.tr/tip-fakultesi"],
    "kafkas": ["https://tip.kafkas.edu.tr/", "https://www.kafkas.edu.tr/tip"],
    "ksu": ["https://tipfakultesi.ksu.edu.tr/"],
    "karabuk": ["https://tip.karabuk.edu.tr/"],
    "ktu": ["https://med.ktu.edu.tr/", "https://www.ktu.edu.tr/tip"],
    "kmu": ["https://www.kmu.edu.tr/tip"],
    "kastamonu": ["https://tip.kastamonu.edu.tr/"],
    "kku": ["https://tip.kku.edu.tr/", "https://www.kku.edu.tr/tip"],
    "klu": ["https://tip.klu.edu.tr/"],
    "ahievran": ["https://tip.ahievran.edu.tr/", "https://www.ahievran.edu.tr/tip-fakultesi"],
    "kocaeli": ["https://tip.kocaeli.edu.tr/", "http://tip.kocaeli.edu.tr/"],
    "ksbu": ["https://tip.ksbu.edu.tr/"],
    "ozal": ["https://tipfakultesi.ozal.edu.tr/"],
    "mcbu": ["http://tip.mcbu.edu.tr/", "https://tip.mcbu.edu.tr/"],
    "marmara": ["https://tip.marmara.edu.tr/"],
    "artuklu": ["https://tip.artuklu.edu.tr/", "https://www.artuklu.edu.tr/tip-fakultesi"],
    "mersin": ["https://www.mersin.edu.tr/akademik/fakulteler/tip-fakultesi", "https://tip.mersin.edu.tr/"],
    "mu": ["https://tip.mu.edu.tr/"],
    "erbakan": [
        "https://www.erbakan.edu.tr/meramtipfakultesi",
        "https://www.erbakan.edu.tr/meram-tip-fakultesi",
        "https://tip.erbakan.edu.tr/",
    ],
    "ohu": ["https://tip.ohu.edu.tr/", "https://www.ohu.edu.tr/tipfakultesi"],
    "omu": ["https://tip.omu.edu.tr/"],
    "odu": ["https://tip.odu.edu.tr/", "https://www.odu.edu.tr/tip"],
    "pau": ["https://www.pau.edu.tr/tip", "https://www.pau.edu.tr/tip/tr"],
    "erdogan": ["https://tip.erdogan.edu.tr/", "https://www.erdogan.edu.tr/tip-fakultesi"],
    "sbu": ["https://tip.sbu.edu.tr/"],
    "sakarya": ["https://tip.sakarya.edu.tr/"],
    "selcuk": ["https://www.selcuk.edu.tr/tip", "https://tip.selcuk.edu.tr/", "https://www.selcuk.edu.tr/Birim/tip_fakultesi"],
    "siirt": ["https://tip.siirt.edu.tr/"],
    "cumhuriyet": ["https://tip.cumhuriyet.edu.tr/duyuru", "https://tip.cumhuriyet.edu.tr/"],
    "sdu": ["https://tip.sdu.edu.tr/tr/duyurular", "https://tip.sdu.edu.tr/"],
    "nku": ["https://tip.nku.edu.tr/"],
    "gop": ["https://tip.gop.edu.tr/", "https://www.gop.edu.tr/tip"],
    "trakya": ["https://tip.trakya.edu.tr/", "https://www.trakya.edu.tr/tip"],
    "usak": ["https://tip.usak.edu.tr/", "https://www.usak.edu.tr/tip-fakultesi"],
    "yyu": ["https://tip.yyu.edu.tr/", "https://www.yyu.edu.tr/Birimler/tip-fakultesi"],
    "yalova": ["https://tip.yalova.edu.tr/"],
    "bozok": ["https://tip.bozok.edu.tr/"],
    "beun": ["https://tip.beun.edu.tr/etkinlikler-ve-duyurular/etkinlikler-ve-duyurular.html", "https://tip.beun.edu.tr/"],
    "acibadem": ["https://www.acibadem.edu.tr/akademik/fakulteler/tip-fakultesi", "https://tip.acibadem.edu.tr/"],
    "altinbas": ["https://www.altinbas.edu.tr/tr/akademik/fakulteler/tip-fakultesi", "https://tip.altinbas.edu.tr/"],
    "ankara_medipol": ["https://www.ankaramedipol.edu.tr/akademik/fakulteler/tip-fakultesi", "https://tip.ankaramedipol.edu.tr/"],
    "atilim": ["https://www.atilim.edu.tr/tr/tip/announcement/list", "https://www.atilim.edu.tr/tr/tip"],
    "bau": ["https://bau.edu.tr/akademik/tip-fakultesi", "https://tip.bau.edu.tr/"],
    "baskent": ["https://tip.baskent.edu.tr/", "https://www.baskent.edu.tr/tr/akademik/fakulteler/tip-fakultesi"],
    "beykent": ["https://tip.beykent.edu.tr/"],
    "bezmialem": ["https://tip.bezmialem.edu.tr/", "https://www.bezmialem.edu.tr/tr/akademik/tip-fakultesi"],
    "biruni": ["https://tip.biruni.edu.tr/"],
    "demiroglu": ["https://www.demiroglu.edu.tr/akademik/tip-fakultesi", "https://tip.demiroglu.edu.tr/"],
    "halic": ["https://halic.edu.tr/tr/tum-duyurular/duyurular-tip-fakultesi", "https://www.halic.edu.tr/tr/akademik/fakulteler/tip-fakultesi"],
    "arel": ["https://www.arel.edu.tr/tip-fakultesi", "https://tip.arel.edu.tr/"],
    "atlas": ["https://www.atlas.edu.tr/akademik/tip-fakultesi", "https://tip.atlas.edu.tr/"],
    "aydin": ["https://www.aydin.edu.tr/tr/akademik/fakulteler/tip-fakultesi", "https://tip.aydin.edu.tr/"],
    "medipol": ["https://www.medipol.edu.tr/akademik/fakulteler/tip-fakultesi"],
    "okan": ["https://www.okan.edu.tr/tip/"],
    "istun": ["https://tip.istun.edu.tr/"],
    "yeniyuzyil": ["https://www.yeniyuzyil.edu.tr/akademik/fakulteler/tip-fakultesi", "https://tip.yeniyuzyil.edu.tr/"],
    "istinye": ["https://www.istinye.edu.tr/tr/akademik/fakulteler/tip-fakultesi", "https://tip.istinye.edu.tr/"],
    "ieu": ["https://tip.ieu.edu.tr/tr/announcements/type/all", "https://tip.ieu.edu.tr/"],
    "tinaztepe": ["https://www.tinaztepe.edu.tr/akademik/tip-fakultesi", "https://tip.tinaztepe.edu.tr/"],
    "koc": ["https://medicine.ku.edu.tr/"],
    "karatay": ["https://www.karatay.edu.tr/tr/akademik/fakulteler/tip-fakultesi", "https://tip.karatay.edu.tr/"],
    "lokmanhekim": ["https://www.lokmanhekim.edu.tr/akademik/tip-fakultesi", "https://tip.lokmanhekim.edu.tr/"],
    "maltepe": ["https://www.maltepe.edu.tr/tip", "https://tip.maltepe.edu.tr/"],
    "nisantasi": ["https://tip.nisantasi.edu.tr/"],
    "sanko": ["https://www.sanko.edu.tr/fakulteler/tip-fakultesi/duyurular/", "https://www.sanko.edu.tr/fakulteler/tip-fakultesi/"],
    "etu": ["https://etu.edu.tr/tr/akademik/tip-fakultesi"],
    "ufuk": ["https://www.ufuk.edu.tr/akademik/tip-fakultesi", "https://tip.ufuk.edu.tr/"],
    "uskudar": ["https://uskudar.edu.tr/tip-fakultesi/duyurular", "https://uskudar.edu.tr/tip-fakultesi/"],
    "yeditepe": ["https://med.yeditepe.edu.tr/tr/duyurular", "https://med.yeditepe.edu.tr/"],
    "yuksekihtisas": ["https://www.yuksekihtisas.edu.tr/akademik/tip-fakultesi", "https://tip.yuksekihtisas.edu.tr/"],
}

META = {
    "istanbul_tip": ("İstanbul Üniversitesi", "İstanbul Tıp Fakültesi"),
    "cerrahpasa": ("İstanbul Üniversitesi-Cerrahpaşa", "Cerrahpaşa Tıp Fakültesi"),
    "erbakan": ("Necmettin Erbakan Üniversitesi", "Meram Tıp Fakültesi"),
    "sbu": ("Sağlık Bilimleri Üniversitesi", "Tıp Fakültesi"),
    "adu": ("Aydın Adnan Menderes Üniversitesi", "Tıp Fakültesi"),
    "koc": ("Koç Üniversitesi", "Tıp Fakültesi"),
}


def faculty_like(url: str, title: str, text: str) -> bool:
    blob = f"{url} {title} {text[:3000]}".lower()
    if "/404" in url.lower() or "sayfa bulunamadı" in blob[:500] and "tıp" not in title.lower():
        if "404" in url.lower():
            return False
    host = urlparse(url).netloc.lower()
    path = urlparse(url).path.lower()
    if host.startswith(("tip.", "med.", "medicine.", "deutf.", "tf.", "tipfakultesi.", "cerrahpasa.", "istanbultip.", "ogrenci-istanbultip.", "fakulte.")):
        return True
    if any(x in path for x in ("/tip", "tip-fakultesi", "tıp-fakültesi", "/medicine", "/med/", "meram")):
        return True
    return "tıp fakültesi" in blob or "faculty of medicine" in blob or "school of medicine" in blob


def fetch(url: str) -> dict:
    try:
        response = requests.get(
            url,
            headers={"User-Agent": UA, "Accept-Language": "tr-TR,tr;q=0.9"},
            timeout=TIMEOUT,
            allow_redirects=True,
        )
    except requests.RequestException as exc:
        return {"url": url, "ok": False, "error": type(exc).__name__, "detail": str(exc)[:180]}
    if response.status_code != 200:
        return {"url": url, "ok": False, "status": response.status_code, "final": response.url}
    if "404" in response.url.lower():
        return {"url": url, "ok": False, "status": 200, "error": "404_url", "final": response.url}
    soup = BeautifulSoup(response.text, "html.parser")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    title = soup.title.get_text(" ", strip=True) if soup.title else ""
    text = re.sub(r"\s+", " ", soup.get_text(" ", strip=True))
    if len(text) < 80:
        return {"url": url, "ok": False, "error": "too_short", "final": response.url}
    if not faculty_like(response.url, title, text):
        return {"url": url, "ok": False, "error": "not_faculty", "final": response.url, "title": title[:160]}
    return {
        "url": url,
        "ok": True,
        "status": 200,
        "final": response.url,
        "title": title[:200],
        "text_len": len(text),
    }


def probe_id(fid: str, urls: list[str]) -> dict:
    for url in urls:
        hit = fetch(url)
        if hit.get("ok"):
            return {"id": fid, "chosen": hit}
    return {"id": fid, "chosen": None, "last": urls[-1] if urls else None}


def source_entry(fid: str, hit: dict) -> dict:
    inst, faculty = META.get(fid, (None, "Tıp Fakültesi"))
    if inst is None:
        # recover institution from first-pass report if present
        inst = fid
    name = f"{inst} {faculty}" if inst != fid else f"{fid} Tıp Fakültesi"
    return {
        "id": f"tip_{fid}_duyuru",
        "name": name,
        "institution": inst if inst != fid else name,
        "faculty": faculty,
        "category": "faculty_announcement",
        "url": hit["final"],
        "source_type": "html",
        "official": True,
        "enabled": True,
        "check_every_minutes": 1440,
    }


def main() -> None:
    report_path = ROOT / "sources" / "faculty_probe_report.json"
    first = {row["id"]: row for row in json.loads(report_path.read_text(encoding="utf-8"))}
    results = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futs = {pool.submit(probe_id, fid, urls): fid for fid, urls in LISTINGS.items()}
        for i, fut in enumerate(as_completed(futs), 1):
            row = fut.result()
            results.append(row)
            status = "OK" if row.get("chosen") else "MISS"
            url = (row.get("chosen") or {}).get("final", "")
            print(f"{i}/{len(LISTINGS)} {status} {row['id']} {url}", flush=True)
    results.sort(key=lambda r: r["id"])
    (ROOT / "sources" / "faculty_listing_report.json").write_text(
        json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    verified = [r for r in results if r.get("chosen")]
    missing = [r["id"] for r in results if not r.get("chosen")]
    sources = []
    for r in verified:
        fid = r["id"]
        inst = first.get(fid, {}).get("institution") or META.get(fid, (fid, ""))[0]
        faculty = first.get(fid, {}).get("faculty") or META.get(fid, ("", "Tıp Fakültesi"))[1]
        if fid in META:
            inst, faculty = META[fid]
        sources.append(
            {
                "id": f"tip_{fid}_duyuru",
                "name": f"{inst} {faculty} duyuruları",
                "institution": inst,
                "faculty": faculty,
                "category": "faculty_announcement",
                "url": r["chosen"]["final"],
                "source_type": "html",
                "official": True,
                "enabled": True,
                "check_every_minutes": 1440,
            }
        )
    payload = {
        "verified": len(verified),
        "missing": missing,
        "sources": sources,
    }
    (ROOT / "sources" / "faculty_verified.yaml").write_text(
        yaml.safe_dump(payload, allow_unicode=True, sort_keys=False),
        encoding="utf-8",
    )
    print(f"verified={len(verified)} missing={len(missing)}")
    print("MISS", ", ".join(missing))


if __name__ == "__main__":
    main()
