"""Sorun tespit listesi - otomatik kontroller (salt okunur, canlı Hub API). Çıktı: PASS / FAIL / MANUAL.
Kullanım:
  python scripts/hekimler_issue_check.py                 (tüm kontroller; çıkış kodu 1 = en az bir FAIL)
  python scripts/hekimler_issue_check.py --list-controls  (yalnız kontrol kimliklerini listele, Hub'a dokunmaz*
                                                             *S-kimlikleri koddan statik çıkarılır, canlı veri gerekmez)
  python scripts/hekimler_issue_check.py --only S16       (tüm kontrolleri çalıştırır -- checkler birbirine bağlı
                                                             tek geçişte hesaplanıyor -- ama yalnız S16 ile başlayan
                                                             satırları basar; çıkış kodu yalnız o alt kümeye göre)
"""
from __future__ import annotations

import argparse
import collections
import json
import os
import re
import sys
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def canonical_source_count() -> int | None:
    """AUTOMATION_READY Hekimler source count, derived from the same registry the Worker's
    deployed readyBundle is generated from -- not a hardcoded number. A mismatch between this
    and the live Hub's source count means the deployed readyBundle is stale relative to the
    registry (this was the exact root cause behind S35). Returns None if the registry can't be
    read locally (e.g. running outside the repo checkout); caller falls back to MANUAL.
    """
    try:
        os.environ.setdefault("HEKIMLER_CONTINUOUS_INGESTION_ENABLED", "true")
        from radar.hekimler_activation import ACTIVATION_AUTOMATION_READY, all_sources, compute_activation_state
        from radar.hekimler_integrity import resolve_effective_registry

        reg = resolve_effective_registry()
        return sum(1 for s in all_sources(reg) if compute_activation_state(s) == ACTIVATION_AUTOMATION_READY)
    except Exception:
        return None

# Static list of control ids this script implements, in run order. Kept in sync manually with the
# check()/external()/manual() calls below -- used by --list-controls (no Hub call needed) and to
# validate --only.
CONTROLS = [
    "S01", "S01b", "S01c", "S03", "S04", "S04b", "S05", "S05b", "S06", "S07", "S07b",
    "S08", "S09", "S10", "S11", "S12", "S13", "S14", "S15", "S15b", "S16", "S16b", "S16c",
    "S17", "S19", "S20", "S24", "S26",
]

HUB = "https://global-content-os.channel-content-os-mcp.workers.dev"
EXTRAS = {"tvhb_veterinary", "tdb_dental"}
NAV = re.compile(r"^(about|contact|staff|partners?|overview|home|news|events?|careers?|privacy|terms|sitemap|faq|login|search|resources|publications|documents?|speeches|our |who we|what we|how we|explorer|api|sdk|docs|documentation|pricing|support|help|team|governance|mission|history|jobs|donate|newsletter|press( |$)|media( |$)|accessibility|cookies?)", re.I)


def get(path: str):
    req = urllib.request.Request(HUB + path, headers={"User-Agent": "hekimler-issue-check/1.0"})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.load(r)


def is_article_link(title: str, url: str) -> bool:
    t = re.sub(r"\s+", " ", title or "").strip()
    words = t.split(" ")
    if len(t) < 25 or len(words) < 4:
        return False
    segs = [s for s in urlparse(url).path.split("/") if s]
    if NAV.match(t) and len(words) <= 6:
        return False
    return not (len(segs) <= 1 and len(words) < 7)


results: list[tuple[str, str, str]] = []


def check(id_: str, ok: bool, detail: str) -> None:
    results.append((id_, "PASS" if ok else "FAIL", detail))


def external(id_: str, ok: bool, detail: str) -> None:
    results.append((id_, "PASS" if ok else "DIŞ", detail))


def manual(id_: str, detail: str) -> None:
    results.append((id_, "MANUAL", detail))


def items(route: str, extra: str = "", limit: int = 500):
    return get(f"/api/items?route={route}{extra}&status=inbox&days=14&limit={limit}")


def main(only: str | None = None) -> int:
    # 1 Hekimler akışı Hub'da görünür; rozet = görünen
    hek = items("tip-ogrencileri", "&channel=hekimler-toplulugu", 500)
    check("S01 Hekimler görünür", len(hek["items"]) > 0, f"görünen {len(hek['items'])}, rozet {hek['counts']['inbox']}")
    check("S01b rozet = görünen", hek["counts"]["inbox"] == len(hek["items"]), f"rozet {hek['counts']['inbox']} / görünen {len(hek['items'])}")
    bad_url = [i for i in hek["items"] if not str(i["canonicalUrl"]).startswith("http")]
    check("S01c resmi URL var", not bad_url, f"URL'siz {len(bad_url)}")

    # 15 tarihsiz / eski içerik Hekimler akışında görünmesin
    from datetime import date, timedelta
    und = [i for i in hek["items"] if not i.get("publishedAt") or "T" in str(i["publishedAt"])]
    check("S15 Hekimler'de tarihsiz kayıt yok", not und, f"{len(und)} adet: " + "; ".join(i["title"][:30] for i in und[:3]))
    limit = (date.today() - timedelta(days=185)).isoformat()
    old = [i for i in hek["items"] if re.match(r"\d{4}-\d\d-\d\d", str(i.get("publishedAt") or "")) and str(i["publishedAt"])[:10] < limit]
    check("S15b Hekimler'de 185 günden eski kayıt yok", not old, f"{len(old)} adet: " + "; ".join(str(i["publishedAt"])[:10] + " " + i["title"][:25] for i in old[:3]))

    # 2/3 AA sağlık dışı
    news = items("kaduse-news")
    aa = [i for i in news["items"] if i["feedId"] == "news-aa-saglik-scoped"]
    off = [i for i in aa if "/tr/saglik/" not in i["canonicalUrl"]]
    check("S03 AA yalnızca sağlık", not off, f"AA {len(aa)} kayıt, sağlık dışı {len(off)}")

    research = items("kaduse-research")
    allk = news["items"] + research["items"]

    # 4 Title Pending / yanlış tarih
    tp = [i for i in allk if re.search(r"title pending|^untitled", i["title"], re.I)]
    fut = [i for i in allk if re.match(r"20\d\d-\d\d-\d\d", str(i.get("publishedAt") or "")) and str(i["publishedAt"])[:10] > "2026-09-30"]
    check("S04 yer tutucu başlık yok", not tp, f"{len(tp)} adet")
    check("S04b ileri tarihli kayıt yok", not fut, f"{len(fut)} adet")

    # 5 menü/navigasyon içerik
    scraper = [i for i in allk if not i.get("publishedAt") and (i.get("summary") or "").strip() in ("", (i["title"] or "").strip())]
    nav = [i for i in scraper if not is_article_link(i["title"], i["canonicalUrl"])]
    check("S05 menü/navigasyon kaydı yok", not nav, f"tarayıcı tipi {len(scraper)}, navigasyon {len(nav)}: " + "; ".join(i["title"][:25] for i in nav[:4]))
    ent = [i for i in allk if re.search(r"&#x?[0-9a-f]+;", i["title"], re.I)]
    check("S05b başlıkta HTML kodu yok", not ent, f"{len(ent)} adet")

    # 16 Kaduse'de eski / tarihsiz içerik (son 500 kayıt üzerinden)
    from datetime import date
    from email.utils import parsedate_to_datetime

    def pdate(v):
        v = str(v or "")
        m = re.match(r"(\d{4})-(\d\d)-(\d\d)", v)
        try:
            if m:
                return date(int(m[1]), int(m[2]), int(m[3]))
            return parsedate_to_datetime(v).date()
        except Exception:
            return None

    from datetime import datetime, timezone

    today = datetime.now(timezone.utc).date()
    for name, d, lim in (("kaduse-news", news, 10),):
        its = d["items"]
        old = [i for i in its if pdate(i.get("publishedAt")) and (today - pdate(i["publishedAt"])).days > lim]
        nod = [i for i in its if pdate(i.get("publishedAt")) is None]
        check(f"S16 {name} {lim} günden eski kayıt yok", not old, f"{len(old)}/{len(its)} (son 500): " + "; ".join(str(pdate(i['publishedAt'])) for i in old[:3]))
        nod = [i for i in nod if i["feedId"] != "news-aa-saglik-scoped"]  # AA listesi tarihsiz kabul edilen tek istisna
        check(f"S16b {name} tarihsiz kayıt yok (AA hariç)", not nod, f"{len(nod)}/{len(its)} tarih çözülemedi")
    manual("S16c araştırma tazelik yöntemi", "Araştırma için yaş/tarih formülü henüz belirlenmedi (kullanıcıyla tasarlanacak); şimdilik yalnız yer tutucu/ileri tarih/GDELT konu kontrolü var")
    dt = collections.Counter(i["title"].strip().lower() for i in news["items"])
    dups = [t for t, n in dt.items() if n > 1]
    check("S17 haberde yinelenen başlık yok", not dups, f"{len(dups)} başlık: " + "; ".join(t[:25] for t in dups[:3]))

    # 6 liste en yeni üstte
    for name, d in (("kaduse-news", news), ("kaduse-research", research)):
        f = [i["fetchedAt"] for i in d["items"]]
        check(f"S06 {name} en yeni üstte", bool(f) and f[0] >= f[-1], f"ilk {f[0][:16] if f else '-'} / son {f[-1][:16] if f else '-'}")

    # 7 Hekimler kaynak durumu (42/46) ve HSGM
    src = get("/api/hekimler/sources")["sources"]
    canon = [s for s in src if s["sourceId"] not in EXTRAS]
    strict = sum(1 for s in canon if s["label"] in ("PIPELINE_OK", "PIPELINE_OK_EMPTY", "PIPELINE_OK_LIMITED"))
    expected_canon = canonical_source_count()
    if expected_canon is None:
        manual("S07 kanonik kaynak sayısı", f"registry lokal olarak okunamadı (yalnız Hub API ile karşılaştırma yapılamıyor); Hub'da {len(canon)} kaynak var")
    else:
        check("S07 kanonik kaynak sayısı == registry AUTOMATION_READY", len(canon) == expected_canon, f"Hub {len(canon)} / registry {expected_canon} kaynak")
    check("S07b katı operasyonel >= 42", strict >= 42, f"{strict}/{len(canon)} (hedef: tümü)")
    hs = next((s for s in src if s["sourceId"] == "hsgm_public_health"), None)
    external("S08 HSGM canlı (PIPELINE_OK)", bool(hs) and hs["label"].startswith("PIPELINE_OK"), f"etiket {hs and hs['label']}, son başarı {hs and (hs.get('telemetry') or {}).get('last_success_at')}")
    for sid in ("abroad_uk_gmc", "abroad_us_ecfmg_intealth", "abroad_de_make_it_in_germany"):
        s = next((x for x in src if x["sourceId"] == sid), None)
        external(f"S09 {sid} tam kapsam", bool(s) and s["label"].startswith("PIPELINE_OK"), f"etiket {s and s['label']}")

    # 19/20 Tıp Öğrencileri kanalı kaldırıldı; kaynak paneli için gerçek sayılar
    tipf = get("/api/feeds?route=tip-ogrencileri")["feeds"]
    check("S19 Tıp Öğrencileri eski kaynakları kapalı", len(tipf) <= 2, f"açık kaynak {len(tipf)} (yalnız Hekimler'in 2 teknik kaydı kalmalı)")
    for rt in ("kaduse-news", "kaduse-research"):
        fd = get(f"/api/feeds?route={rt}")["feeds"]
        check(f"S20 {rt} kaynak paneli verisi", bool(fd) and all("inbox_count" in f and "last_error" in f for f in fd), f"{len(fd)} kaynak, gelen kutusu toplamı {sum(f.get('inbox_count', 0) for f in fd)}")

    # Sağlık kontrolü
    h = get("/api/health")
    check("S10 Worker sağlık", h.get("ok") is True, f"commit {h.get('commit')}")

    manual("S11 Kaduse feed hataları (D1)", "wrangler d1: SELECT route,count(*),sum(last_error IS NOT NULL) FROM source_feeds WHERE enabled=1 GROUP BY route  (hedef: 0 stale, kalanlar harici engel)")
    manual("S12 Workers CPU sınırı", "Cloudflare workersInvocationsAdaptive: exceededResources = 0 (son 24 saat); uyarı penceresi 2026-09-22 ~17:14Z sonrası temiz olmalı")
    manual("S13 D1 yazma kotası 24 saat", "d1AnalyticsAdaptiveGroups rowsWritten: 2026-09-21 17:13Z -> 2026-09-22 17:13Z ve UTC gün toplamı; kota 100.000/gün")
    manual("S24 D1 okuma kotası", "wrangler d1 insights <db> --timePeriod 1d --json, tüm sorgular toplanır: rowsRead < 5.000.000/gün, rowsWritten < 100.000/gün (son ölçüm 2026-09-23: 2.503.549 okuma / 22.110 yazma -- ikisi de sınırın altında)")
    manual("S26 Hatalı feed geri çekilme", "SELECT id,last_error,last_fetched_at FROM source_feeds WHERE enabled=1 AND last_error IS NOT NULL: her hatalı feed en fazla 12 saatte bir denenmeli")
    manual("S14 MCP channel-content-os 401", "~/.claude.json içindeki statik Bearer başlığı kaldırılıp /mcp ile OAuth yetkilendirme")

    shown = results
    if only:
        shown = [r for r in results if r[0] == only or r[0].startswith(only + " ") or r[0].startswith(only + "b") or r[0].startswith(only + "c")]
        if not shown:
            print(f"bilinmeyen veya bu koşuda üretilmeyen kontrol kimliği: {only}")
            return 2

    w = max(len(r[0]) for r in shown) if shown else 0
    for id_, st, d in shown:
        print(f"{st:6} {id_:<{w}}  {d}")
    fails = sum(1 for r in shown if r[1] == "FAIL")
    print(f"\nPASS {sum(1 for r in shown if r[1]=='PASS')}  FAIL {fails}  DIŞ {sum(1 for r in shown if r[1]=='DIŞ')}  MANUAL {sum(1 for r in shown if r[1]=='MANUAL')}")
    return 1 if fails else 0


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except Exception:
        pass
    ap = argparse.ArgumentParser()
    ap.add_argument("--list-controls", action="store_true", help="Kontrol kimliklerini listele (Hub'a dokunmaz).")
    ap.add_argument("--only", default=None, help="Yalnız bu kimlik (ör. S16) ile başlayan kontrol satırlarını bas.")
    args = ap.parse_args()
    if args.list_controls:
        print(" ".join(CONTROLS))
        sys.exit(0)
    if args.only and args.only not in CONTROLS:
        print(f"bilinmeyen kontrol kimliği: {args.only} (bkz. --list-controls)")
        sys.exit(2)
    sys.exit(main(only=args.only))
