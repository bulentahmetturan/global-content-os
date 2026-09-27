"""Probe candidate faculty URLs. Only HTTP-verified pages are kept."""

from __future__ import annotations

import json
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

UA = "TipOgrencileriRadar/0.1 (+editorial-monitoring)"
ROOT = Path(__file__).resolve().parents[1]
TIMEOUT = 18
WORKERS = 6

# Wikipedia active list (closed / not-yet-open omitted). Domains are public
# institutional hosts; faculty URL is accepted only after a live GET.
FACULTIES: list[dict] = [
    {"id": "adiyaman", "institution": "Adıyaman Üniversitesi", "host": "adiyaman.edu.tr"},
    {"id": "afsu", "institution": "Afyonkarahisar Sağlık Bilimleri Üniversitesi", "host": "afsu.edu.tr"},
    {"id": "agri", "institution": "Ağrı İbrahim Çeçen Üniversitesi", "host": "agri.edu.tr"},
    {"id": "akdeniz", "institution": "Akdeniz Üniversitesi", "host": "akdeniz.edu.tr"},
    {"id": "aksaray", "institution": "Aksaray Üniversitesi", "host": "aksaray.edu.tr"},
    {"id": "alanya", "institution": "Alanya Alaaddin Keykubat Üniversitesi", "host": "alanya.edu.tr"},
    {"id": "amasya", "institution": "Amasya Üniversitesi", "host": "amasya.edu.tr"},
    {"id": "ankara", "institution": "Ankara Üniversitesi", "host": "ankara.edu.tr"},
    {"id": "aybu", "institution": "Ankara Yıldırım Beyazıt Üniversitesi", "host": "aybu.edu.tr"},
    {"id": "atauni", "institution": "Atatürk Üniversitesi", "host": "atauni.edu.tr"},
    {"id": "adu", "institution": "Aydın Adnan Menderes Üniversitesi", "host": "adu.edu.tr"},
    {"id": "balikesir", "institution": "Balıkesir Üniversitesi", "host": "balikesir.edu.tr"},
    {"id": "bandirma", "institution": "Bandırma Onyedi Eylül Üniversitesi", "host": "bandirma.edu.tr"},
    {"id": "ibu", "institution": "Bolu Abant İzzet Baysal Üniversitesi", "host": "ibu.edu.tr"},
    {"id": "uludag", "institution": "Bursa Uludağ Üniversitesi", "host": "uludag.edu.tr"},
    {"id": "comu", "institution": "Çanakkale Onsekiz Mart Üniversitesi", "host": "comu.edu.tr"},
    {"id": "cu", "institution": "Çukurova Üniversitesi", "host": "cu.edu.tr"},
    {"id": "dicle", "institution": "Dicle Üniversitesi", "host": "dicle.edu.tr"},
    {"id": "deu", "institution": "Dokuz Eylül Üniversitesi", "host": "deu.edu.tr"},
    {"id": "duzce", "institution": "Düzce Üniversitesi", "host": "duzce.edu.tr"},
    {"id": "ege", "institution": "Ege Üniversitesi", "host": "ege.edu.tr"},
    {"id": "erciyes", "institution": "Erciyes Üniversitesi", "host": "erciyes.edu.tr"},
    {"id": "erzincan", "institution": "Erzincan Binali Yıldırım Üniversitesi", "host": "erzincan.edu.tr"},
    {"id": "ogu", "institution": "Eskişehir Osmangazi Üniversitesi", "host": "ogu.edu.tr"},
    {"id": "firat", "institution": "Fırat Üniversitesi", "host": "firat.edu.tr"},
    {"id": "gazi", "institution": "Gazi Üniversitesi", "host": "gazi.edu.tr"},
    {"id": "gantep", "institution": "Gaziantep Üniversitesi", "host": "gantep.edu.tr"},
    {"id": "gibtu", "institution": "Gaziantep İslam Bilim ve Teknoloji Üniversitesi", "host": "gibtu.edu.tr"},
    {"id": "giresun", "institution": "Giresun Üniversitesi", "host": "giresun.edu.tr"},
    {"id": "hacettepe", "institution": "Hacettepe Üniversitesi", "host": "hacettepe.edu.tr"},
    {"id": "harran", "institution": "Harran Üniversitesi", "host": "harran.edu.tr"},
    {"id": "mku", "institution": "Hatay Mustafa Kemal Üniversitesi", "host": "mku.edu.tr"},
    {"id": "hitit", "institution": "Hitit Üniversitesi", "host": "hitit.edu.tr"},
    {"id": "inonu", "institution": "İnönü Üniversitesi", "host": "inonu.edu.tr"},
    {"id": "medeniyet", "institution": "İstanbul Medeniyet Üniversitesi", "host": "medeniyet.edu.tr"},
    {"id": "istanbul_tip", "institution": "İstanbul Üniversitesi", "host": "istanbul.edu.tr", "faculty": "İstanbul Tıp Fakültesi"},
    {"id": "cerrahpasa", "institution": "İstanbul Üniversitesi-Cerrahpaşa", "host": "iuc.edu.tr", "faculty": "Cerrahpaşa Tıp Fakültesi"},
    {"id": "bakircay", "institution": "İzmir Bakırçay Üniversitesi", "host": "bakircay.edu.tr"},
    {"id": "idu", "institution": "İzmir Demokrasi Üniversitesi", "host": "idu.edu.tr"},
    {"id": "ikc", "institution": "İzmir Kâtip Çelebi Üniversitesi", "host": "ikc.edu.tr"},
    {"id": "kafkas", "institution": "Kafkas Üniversitesi", "host": "kafkas.edu.tr"},
    {"id": "ksu", "institution": "Kahramanmaraş Sütçü İmam Üniversitesi", "host": "ksu.edu.tr"},
    {"id": "karabuk", "institution": "Karabük Üniversitesi", "host": "karabuk.edu.tr"},
    {"id": "ktu", "institution": "Karadeniz Teknik Üniversitesi", "host": "ktu.edu.tr"},
    {"id": "kmu", "institution": "Karamanoğlu Mehmetbey Üniversitesi", "host": "kmu.edu.tr"},
    {"id": "kastamonu", "institution": "Kastamonu Üniversitesi", "host": "kastamonu.edu.tr"},
    {"id": "kku", "institution": "Kırıkkale Üniversitesi", "host": "kku.edu.tr"},
    {"id": "klu", "institution": "Kırklareli Üniversitesi", "host": "klu.edu.tr"},
    {"id": "ahievran", "institution": "Kırşehir Ahi Evran Üniversitesi", "host": "ahievran.edu.tr"},
    {"id": "kocaeli", "institution": "Kocaeli Üniversitesi", "host": "kocaeli.edu.tr"},
    {"id": "ksbu", "institution": "Kütahya Sağlık Bilimleri Üniversitesi", "host": "ksbu.edu.tr"},
    {"id": "ozal", "institution": "Malatya Turgut Özal Üniversitesi", "host": "ozal.edu.tr"},
    {"id": "mcbu", "institution": "Manisa Celal Bayar Üniversitesi", "host": "mcbu.edu.tr"},
    {"id": "marmara", "institution": "Marmara Üniversitesi", "host": "marmara.edu.tr"},
    {"id": "artuklu", "institution": "Mardin Artuklu Üniversitesi", "host": "artuklu.edu.tr"},
    {"id": "mersin", "institution": "Mersin Üniversitesi", "host": "mersin.edu.tr"},
    {"id": "mu", "institution": "Muğla Sıtkı Koçman Üniversitesi", "host": "mu.edu.tr"},
    {"id": "erbakan", "institution": "Necmettin Erbakan Üniversitesi", "host": "erbakan.edu.tr", "faculty": "Meram Tıp Fakültesi"},
    {"id": "ohu", "institution": "Niğde Ömer Halisdemir Üniversitesi", "host": "ohu.edu.tr"},
    {"id": "omu", "institution": "Ondokuz Mayıs Üniversitesi", "host": "omu.edu.tr"},
    {"id": "odu", "institution": "Ordu Üniversitesi", "host": "odu.edu.tr"},
    {"id": "pau", "institution": "Pamukkale Üniversitesi", "host": "pau.edu.tr"},
    {"id": "erdogan", "institution": "Recep Tayyip Erdoğan Üniversitesi", "host": "erdogan.edu.tr"},
    {"id": "sbu_adana", "institution": "Sağlık Bilimleri Üniversitesi", "host": "sbu.edu.tr", "faculty": "Adana Tıp Fakültesi"},
    {"id": "sbu_bursa", "institution": "Sağlık Bilimleri Üniversitesi", "host": "sbu.edu.tr", "faculty": "Bursa Tıp Fakültesi"},
    {"id": "sbu_erzurum", "institution": "Sağlık Bilimleri Üniversitesi", "host": "sbu.edu.tr", "faculty": "Erzurum Tıp Fakültesi"},
    {"id": "sbu_gulhane", "institution": "Sağlık Bilimleri Üniversitesi", "host": "sbu.edu.tr", "faculty": "Gülhane Tıp Fakültesi"},
    {"id": "sbu_hamidiye", "institution": "Sağlık Bilimleri Üniversitesi", "host": "sbu.edu.tr", "faculty": "Hamidiye Tıp Fakültesi"},
    {"id": "sbu_hamidiye_int", "institution": "Sağlık Bilimleri Üniversitesi", "host": "sbu.edu.tr", "faculty": "Hamidiye Uluslararası Tıp Fakültesi"},
    {"id": "sbu_izmir", "institution": "Sağlık Bilimleri Üniversitesi", "host": "sbu.edu.tr", "faculty": "İzmir Tıp Fakültesi"},
    {"id": "sbu_trabzon", "institution": "Sağlık Bilimleri Üniversitesi", "host": "sbu.edu.tr", "faculty": "Trabzon Tıp Fakültesi"},
    {"id": "sakarya", "institution": "Sakarya Üniversitesi", "host": "sakarya.edu.tr"},
    {"id": "selcuk", "institution": "Selçuk Üniversitesi", "host": "selcuk.edu.tr"},
    {"id": "siirt", "institution": "Siirt Üniversitesi", "host": "siirt.edu.tr"},
    {"id": "cumhuriyet", "institution": "Sivas Cumhuriyet Üniversitesi", "host": "cumhuriyet.edu.tr"},
    {"id": "sdu", "institution": "Süleyman Demirel Üniversitesi", "host": "sdu.edu.tr"},
    {"id": "nku", "institution": "Tekirdağ Namık Kemal Üniversitesi", "host": "nku.edu.tr"},
    {"id": "gop", "institution": "Tokat Gaziosmanpaşa Üniversitesi", "host": "gop.edu.tr"},
    {"id": "trakya", "institution": "Trakya Üniversitesi", "host": "trakya.edu.tr"},
    {"id": "usak", "institution": "Uşak Üniversitesi", "host": "usak.edu.tr"},
    {"id": "yyu", "institution": "Van Yüzüncü Yıl Üniversitesi", "host": "yyu.edu.tr"},
    {"id": "yalova", "institution": "Yalova Üniversitesi", "host": "yalova.edu.tr"},
    {"id": "bozok", "institution": "Yozgat Bozok Üniversitesi", "host": "bozok.edu.tr"},
    {"id": "beun", "institution": "Zonguldak Bülent Ecevit Üniversitesi", "host": "beun.edu.tr"},
    {"id": "acibadem", "institution": "Acıbadem Mehmet Ali Aydınlar Üniversitesi", "host": "acibadem.edu.tr"},
    {"id": "altinbas", "institution": "Altınbaş Üniversitesi", "host": "altinbas.edu.tr"},
    {"id": "ankara_medipol", "institution": "Ankara Medipol Üniversitesi", "host": "ankaramedipol.edu.tr"},
    {"id": "atilim", "institution": "Atılım Üniversitesi", "host": "atilim.edu.tr"},
    {"id": "bau", "institution": "Bahçeşehir Üniversitesi", "host": "bau.edu.tr"},
    {"id": "baskent", "institution": "Başkent Üniversitesi", "host": "baskent.edu.tr"},
    {"id": "beykent", "institution": "Beykent Üniversitesi", "host": "beykent.edu.tr"},
    {"id": "bezmialem", "institution": "Bezmialem Vakıf Üniversitesi", "host": "bezmialem.edu.tr"},
    {"id": "biruni", "institution": "Biruni Üniversitesi", "host": "biruni.edu.tr"},
    {"id": "demiroglu", "institution": "Demiroğlu Bilim Üniversitesi", "host": "demiroglu.edu.tr"},
    {"id": "halic", "institution": "Haliç Üniversitesi", "host": "halic.edu.tr"},
    {"id": "arel", "institution": "İstanbul Arel Üniversitesi", "host": "arel.edu.tr"},
    {"id": "atlas", "institution": "İstanbul Atlas Üniversitesi", "host": "atlas.edu.tr"},
    {"id": "aydin", "institution": "İstanbul Aydın Üniversitesi", "host": "aydin.edu.tr"},
    {"id": "medipol", "institution": "İstanbul Medipol Üniversitesi", "host": "medipol.edu.tr"},
    {"id": "okan", "institution": "İstanbul Okan Üniversitesi", "host": "okan.edu.tr"},
    {"id": "istun", "institution": "İstanbul Sağlık ve Teknoloji Üniversitesi", "host": "istun.edu.tr"},
    {"id": "yeniyuzyil", "institution": "İstanbul Yeni Yüzyıl Üniversitesi", "host": "yeniyuzyil.edu.tr"},
    {"id": "istinye", "institution": "İstinye Üniversitesi", "host": "istinye.edu.tr"},
    {"id": "ieu", "institution": "İzmir Ekonomi Üniversitesi", "host": "ieu.edu.tr"},
    {"id": "tinaztepe", "institution": "İzmir Tınaztepe Üniversitesi", "host": "tinaztepe.edu.tr"},
    {"id": "koc", "institution": "Koç Üniversitesi", "host": "ku.edu.tr"},
    {"id": "karatay", "institution": "KTO Karatay Üniversitesi", "host": "karatay.edu.tr"},
    {"id": "lokmanhekim", "institution": "Lokman Hekim Üniversitesi", "host": "lokmanhekim.edu.tr"},
    {"id": "maltepe", "institution": "Maltepe Üniversitesi", "host": "maltepe.edu.tr"},
    {"id": "nisantasi", "institution": "Nişantaşı Üniversitesi", "host": "nisantasi.edu.tr"},
    {"id": "sanko", "institution": "Sanko Üniversitesi", "host": "sanko.edu.tr"},
    {"id": "etu", "institution": "TOBB Ekonomi ve Teknoloji Üniversitesi", "host": "etu.edu.tr"},
    {"id": "ufuk", "institution": "Ufuk Üniversitesi", "host": "ufuk.edu.tr"},
    {"id": "uskudar", "institution": "Üsküdar Üniversitesi", "host": "uskudar.edu.tr"},
    {"id": "yeditepe", "institution": "Yeditepe Üniversitesi", "host": "yeditepe.edu.tr"},
    {"id": "yuksekihtisas", "institution": "Yüksek İhtisas Üniversitesi", "host": "yuksekihtisas.edu.tr"},
]

EXTRA_CANDIDATES: dict[str, list[str]] = {
    "hacettepe": [
        "https://tip.hacettepe.edu.tr/tr/duyurular",
        "https://tip.hacettepe.edu.tr/",
    ],
    "gazi": ["https://med.gazi.edu.tr/", "http://med.gazi.edu.tr/"],
    "ege": ["https://med.ege.edu.tr/", "https://tip.ege.edu.tr/"],
    "deu": ["https://tip.deu.edu.tr/", "https://deutf.deu.edu.tr/"],
    "istanbul_tip": [
        "https://istanbultip.istanbul.edu.tr/",
        "http://istanbultip.istanbul.edu.tr/",
    ],
    "cerrahpasa": [
        "https://cerrahpasa.iuc.edu.tr/",
        "https://ctf.istanbulc.edu.tr/",
        "https://tip.iuc.edu.tr/",
    ],
    "marmara": ["https://tip.marmara.edu.tr/"],
    "omu": ["https://tip.omu.edu.tr/", "http://tip.omu.edu.tr/"],
    "cu": ["https://tip.cu.edu.tr/"],
    "ktu": ["https://www.ktu.edu.tr/tip", "http://www.ktu.edu.tr/tip"],
    "pau": ["https://www.pau.edu.tr/tip", "http://www.pau.edu.tr/tip"],
    "comu": ["http://tip.comu.edu.tr/", "https://tip.comu.edu.tr/"],
    "firat": ["http://yenitip.firat.edu.tr/", "https://tip.firat.edu.tr/"],
    "bandirma": ["https://tip.bandirma.edu.tr/"],
    "ieu": ["https://tip.ieu.edu.tr/"],
    "yeditepe": ["https://med.yeditepe.edu.tr/"],
    "uskudar": ["https://uskudar.edu.tr/tip-fakultesi/"],
    "ankara": [
        "https://medicine.ankara.edu.tr/",
        "https://tip.ankara.edu.tr/",
        "http://medicine.ankara.edu.tr/",
    ],
    "sbu_gulhane": [
        "https://gulhane.sbu.edu.tr/",
        "https://gata.sbu.edu.tr/",
        "https://sbu.edu.tr/gulhane-tip-fakultesi",
    ],
    "sbu_hamidiye": [
        "https://hamidiye.sbu.edu.tr/",
        "https://sbu.edu.tr/hamidiye-tip-fakultesi",
    ],
    "koc": ["https://medicine.ku.edu.tr/", "https://tip.ku.edu.tr/"],
    "erbakan": [
        "https://www.erbakan.edu.tr/meramtıp",
        "https://www.erbakan.edu.tr/meramtip",
        "https://tip.erbakan.edu.tr/",
        "https://www.erbakan.edu.tr/meram-tip-fakultesi",
    ],
    "mcbu": ["https://tip.mcbu.edu.tr/", "https://www.mcbu.edu.tr/tip"],
    "cbu_legacy": ["https://tip.cbu.edu.tr/"],
}

PATHS = [
    "",
    "/tr/duyurular",
    "/duyurular",
    "/tr/duyuru",
    "/duyuru",
    "/tr",
]


def slug_hosts(host: str) -> list[str]:
    base = host.lower()
    prefixes = ("tip", "med", "medicine", "tf", "deutf")
    hosts = [f"https://{p}.{base}/" for p in prefixes]
    hosts += [
        f"https://www.{base}/tip",
        f"https://www.{base}/tr/tip-fakultesi",
        f"https://{base}/tip",
        f"https://{base}/tr/akademik/tip-fakultesi",
        f"https://tipfakultesi.{base}/",
    ]
    return hosts


def candidates_for(item: dict) -> list[str]:
    urls = list(EXTRA_CANDIDATES.get(item["id"], []))
    urls.extend(slug_hosts(item["host"]))
    seen: set[str] = set()
    out = []
    for url in urls:
        if url not in seen:
            seen.add(url)
            out.append(url)
    return out


def looks_like_faculty(url: str, title: str, text: str) -> bool:
    blob = f"{url} {title} {text}".lower()
    if any(x in blob for x in ("veteriner", "diş hekimliği", "dis hekimligi", "eczacılık")):
        if "tıp fakültesi" not in blob and "tip fakultesi" not in blob:
            return False
    markers = (
        "tıp fakültesi",
        "tip fakultesi",
        "faculty of medicine",
        "school of medicine",
        "mezuniyet öncesi",
        "tıp eğitimi",
    )
    host = urlparse(url).netloc.lower()
    if host.startswith(("tip.", "med.", "medicine.", "deutf.", "tf.")):
        return True
    return any(m in blob for m in markers)


def fetch(url: str) -> dict | None:
    try:
        response = requests.get(
            url,
            headers={"User-Agent": UA, "Accept-Language": "tr-TR,tr;q=0.9"},
            timeout=TIMEOUT,
            allow_redirects=True,
        )
    except requests.RequestException as exc:
        return {"url": url, "ok": False, "error": type(exc).__name__, "detail": str(exc)[:200]}
    if response.status_code != 200:
        return {"url": url, "ok": False, "status": response.status_code, "final": response.url}
    ctype = response.headers.get("content-type", "").lower()
    if "html" not in ctype and "text" not in ctype:
        return {"url": url, "ok": False, "status": response.status_code, "error": "not_html"}
    soup = BeautifulSoup(response.text, "html.parser")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    title = soup.title.get_text(" ", strip=True) if soup.title else ""
    text = re.sub(r"\s+", " ", soup.get_text(" ", strip=True))
    if len(text) < 80:
        return {"url": url, "ok": False, "status": 200, "error": "too_short", "final": response.url}
    faculty = looks_like_faculty(response.url, title, text[:4000])
    duyuru_links = []
    for a in soup.select("a[href]"):
        href = a.get("href", "")
        label = a.get_text(" ", strip=True).lower()
        if "duyuru" in label or "duyuru" in href.lower():
            duyuru_links.append(urljoin(response.url, href))
    calendar_links = []
    for a in soup.select("a[href]"):
        href = a.get("href", "")
        label = a.get_text(" ", strip=True).lower()
        if "akademik takvim" in label or "akademik-takvim" in href.lower():
            calendar_links.append(urljoin(response.url, href))
    return {
        "url": url,
        "ok": True,
        "faculty_like": faculty,
        "status": 200,
        "final": response.url,
        "title": title[:200],
        "text_len": len(text),
        "duyuru_links": duyuru_links[:8],
        "calendar_links": calendar_links[:6],
    }


def pick_best(hits: list[dict]) -> tuple[dict | None, dict | None]:
    good = [h for h in hits if h.get("ok") and h.get("faculty_like")]
    if not good:
        return None, None
    duyuru = None
    for hit in good:
        if "duyuru" in (hit.get("final") or hit["url"]).lower():
            duyuru = hit
            break
    home = good[0]
    calendar = None
    for hit in good:
        links = hit.get("calendar_links") or []
        if links:
            calendar = {"from": hit["final"], "url": links[0]}
            break
    chosen = duyuru or home
    extra_duyuru = None
    if not duyuru:
        for hit in good:
            links = hit.get("duyuru_links") or []
            if links:
                extra_duyuru = links[0]
                break
        if extra_duyuru:
            probed = fetch(extra_duyuru)
            if probed and probed.get("ok") and probed.get("faculty_like"):
                chosen = probed
    cal_hit = None
    if calendar:
        probed = fetch(calendar["url"])
        if probed and probed.get("ok"):
            cal_hit = probed
    return chosen, cal_hit


def probe_one(item: dict) -> dict:
    hits = []
    for url in candidates_for(item)[:14]:
        result = fetch(url)
        if result:
            hits.append(result)
        time.sleep(0.05)
    chosen, calendar = pick_best(hits)
    return {
        "id": item["id"],
        "institution": item["institution"],
        "faculty": item.get("faculty", "Tıp Fakültesi"),
        "host": item["host"],
        "chosen": chosen,
        "calendar": calendar,
        "tried": len(hits),
        "ok_hits": sum(1 for h in hits if h.get("ok") and h.get("faculty_like")),
    }


def main() -> None:
    results = []
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futs = {pool.submit(probe_one, item): item["id"] for item in FACULTIES}
        for i, fut in enumerate(as_completed(futs), 1):
            row = fut.result()
            results.append(row)
            status = "OK" if row.get("chosen") else "MISS"
            url = (row.get("chosen") or {}).get("final", "")
            print(f"{i}/{len(FACULTIES)} {status} {row['id']} {url}", flush=True)
    results.sort(key=lambda r: r["id"])
    out = ROOT / "sources" / "faculty_probe_report.json"
    out.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    ok = sum(1 for r in results if r.get("chosen"))
    print(f"done verified={ok} missing={len(results) - ok} report={out}")


if __name__ == "__main__":
    main()
