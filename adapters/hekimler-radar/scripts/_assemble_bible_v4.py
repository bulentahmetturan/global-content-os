"""One-shot: Bible v3 (Kitap I) + SPF Book II → living Bible v4."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "content"
HUB = ROOT.parents[1] / "apps" / "hub"
ARCHIVE = CONTENT / "archive"
BOOK2 = CONTENT / "_bible_v4_book2.md"
V3 = CONTENT / "00_TURK_TIP_CONTENT_OS_BIBLE_v3.md"
V4 = CONTENT / "00_TURK_TIP_CONTENT_OS_BIBLE_v4.md"

HEADER = """# TÜRK TIP İÇERİK OS — BIBLE v4

> **Durum:** Normatif / bağlayıcı sistem anayasası  
> **Sürüm:** 4.0  
> **Kapsam:** Haber, Burs, Eğitim, Duyuru, Research  
> **Kurallar kümesi:** Kitap I (anayasa) + Kitap II (`source-pass-fail-v1`)  
> **Temel ilke:** Sistem hızdan, engagement'tan ve otomasyondan önce doğruluk, güvenlik, kaynak bütünlüğü ve izlenebilirliği korur.

| Sürüm | Not |
|---|---|
| 3.0 | Kitap I — hard gate, fail-closed, beş kategori, eligibility eksenleri |
| 4.0 | Kitap II — Source Pass/Fail & Pipeline Loop; iki değerlendirme hattı; editorial ≠ ingestion ≠ lifecycle |

v3 metni Kitap I olarak korunur (Bölüm 0–35). Source Pass/Fail sözleşmesi **SPF-0 … SPF-35** olarak Kitap II'dedir; Kitap I bölüm numaraları ile çakışmaz.
"""

CHANGELOG_AFTER_AUTHORITY = """
### 0.0. Kitap yapısı (v4)

- **Kitap I (Bölüm 0–35):** doğruluk, güvenlik, kanıt, uygunluk, dedup, insan onayı, auto-publish yasağı.
- **Kitap II (SPF-0–35):** kaynak editorial kararı, ingestion mode, lifecycle, dinamik çekim, sağlık izleme, geri besleme (revalidation).

Çelişkide Kitap I hard gate kazanır. Numeric eşikler, cadence ve backoff **Config**'tedir.

"""

ENVELOPE_NOTE = '''### 0.2. Her işlem için Bible Compliance Envelope zorunludur

Sistemde hiçbir işlem yalnızca “başarılı çalıştı” diye geçerli sayılmaz. Her işlem aşağıdaki uygunluk kaydını üretir:

```yaml
bible_version: "4.0"
ruleset_version: "source-pass-fail-v1"
schema_version: "spf-1.0.0"
entity_type: source | content | opportunity | publication
entity_id: "..."
stage: discovery | verification | fetch | normalize | dedup | classify | eligibility | evidence | ranking | review | production | measurement | revalidation
decision_scope: source | source_category | item
category: haber | research | duyuru | burs | egitim
evaluation_track: ENGAGEMENT | PRAGMATIC_UTILITY
source_role: discovery | verification | both
editorial_decision: PASS | CONDITIONAL | WATCH | FAIL
ingestion_mode: AUTO_API | AUTO_RSS | AUTO_ATOM | AUTO_SITEMAP | AUTO_HTML | MANUAL_ONLY | BLOCKED
lifecycle_status: candidate | verified | active | degraded | manual_only | paused | retired | denylisted
checks:
  - rule_id: "BIB-... | SPF-..."
    status: PASS | FAIL | UNKNOWN | HUMAN_REQUIRED
    evidence: "..."
    checked_at: "ISO-8601"
decision: ADVANCE | HOLD | REJECT | HUMAN_REVIEW
human_override:
  applied: false
  approved_by: null
  reason: null
```

Kaynak ve içerik kararlarında Kitap II SPF-33 ek alanları (soft score, score_confidence, reason_codes, next_review_at, audit_event_id) zorunludur.

'''

LOOP = """
GLOBAL CONTENT OS için sürekli çalışan bir **Bible Compliance Loop** uygula.

Temel referans ve tek bağlayıcı kaynak:

`00_TURK_TIP_CONTENT_OS_BIBLE_v4.md`

LOOP MANTIĞI:

1. GLOBAL CONTENT OS içindeki bütün ilgili bilgileri, dosyaları, dokümantasyonları, kuralları, sistem tanımlarını, workflow’ları, pipeline’ları, veri yapılarını, kaynak kayıtlarını, config’leri, promptları ve ilgili tüm içerikleri tara.
2. Her turda bu unsurların `00_TURK_TIP_CONTENT_OS_BIBLE_v4.md` ile uyumlu olup olmadığını kontrol et — Kitap I hard gate’ler ve Kitap II Source Pass/Fail (SPF) kuralları dahil.
3. Bible ile çelişen, eski yapıya ait, eksik veya Bible’daki mevcut kurallarla uyumsuz olan her şeyi tespit et.
4. Tespit edilen uyumsuzlukları Bible’a uygun hale getir.
5. Yapılan değişikliklerden sonra GLOBAL CONTENT OS’nin tamamını yeniden tara.
6. Yeni yapılan değişikliklerin başka dosyalarda, sistemlerde, kurallarda veya bağlantılı yapılarda yeni bir uyumsuzluk oluşturup oluşturmadığını kontrol et.
7. Her yeni uyumsuzluk bulunduğunda gerekli düzeltmeleri yap ve tekrar baştan kontrol et.
8. Bu döngüyü şu koşul sağlanana kadar devam ettir:

`GLOBAL CONTENT OS içindeki bütün ilgili bilgi ve dosyalar 00_TURK_TIP_CONTENT_OS_BIBLE_v4.md ile tam uyumlu.`

1. Daha sonra da sistemde herhangi bir dosya, bilgi, kural, workflow, pipeline, veri yapısı, kaynak, config veya prompt değiştirildiğinde aynı Bible Compliance Loop yeniden çalıştırılsın.
2. Yeni eklenen her unsur da GLOBAL CONTENT OS’ye kalıcı olarak alınmadan önce `00_TURK_TIP_CONTENT_OS_BIBLE_v4.md` ile uyumluluk kontrolünden geçsin.
3. Source Pass/Fail geri beslemesi (SPF-28) aynı loop’un parçasıdır: periyodik Config aralığında ve event-triggered (domain/publisher/RSS-API kaybı, robots/ToS, parser, health, redirect, cadence, retraction, güvenlik) karar yeniden üretilir. Eski karar silinmez (SPF-31). Fetch hatası SOURCE FAIL değildir.

KURAL:

`00_TURK_TIP_CONTENT_OS_BIBLE_v4.md` GLOBAL CONTENT OS için sürekli geçerli olan temel referanstır. Sistemde yapılan her mevcut ve gelecekteki değişiklik bu Bible’a göre kontrol edilir. Uyumsuzluk bulunduğu sürece loop durmaz.
"""

V3_STUB = """# TÜRK TIP İÇERİK OS — BIBLE v3 (arşiv işaretçisi)

Yaşayan anayasa **v4**'tür.

- Hub: `/?route=bible`
- Belge: [`00_TURK_TIP_CONTENT_OS_BIBLE_v4.md`](00_TURK_TIP_CONTENT_OS_BIBLE_v4.md)
- Arşiv kopyası: [`archive/00_TURK_TIP_CONTENT_OS_BIBLE_v3.md`](archive/00_TURK_TIP_CONTENT_OS_BIBLE_v3.md)

v3 Kitap I metni v4 içinde korunur. Source Pass/Fail sözleşmesi Kitap II (SPF) olarak v4'e eklenmiştir.
"""

HUB_V3_STUB = """# TÜRK TIP İÇERİK OS — BIBLE v3 (arşiv işaretçisi)

Yaşayan anayasa **v4**'tür: [`00_TURK_TIP_CONTENT_OS_BIBLE_v4.md`](00_TURK_TIP_CONTENT_OS_BIBLE_v4.md) — Hub `/?route=bible`.
"""


def main() -> None:
    v3 = V3.read_text(encoding="utf-8")
    book2 = BOOK2.read_text(encoding="utf-8").lstrip()
    ARCHIVE.mkdir(parents=True, exist_ok=True)
    archived = ARCHIVE / "00_TURK_TIP_CONTENT_OS_BIBLE_v3.md"
    if not archived.exists():
        archived.write_text(v3, encoding="utf-8")

    body = v3
    if body.startswith("# TÜRK TIP İÇERİK OS — BIBLE v3"):
        first_hr = body.find("\n---\n")
        if first_hr == -1:
            raise SystemExit("v3 header separator not found")
        body = HEADER + body[first_hr:]
    else:
        raise SystemExit("unexpected v3 header")

    marker = "## BÖLÜM 0 — BIBLE'IN OTORİTESİ VE UYUM SÖZLEŞMESİ"
    idx = body.find(marker)
    if idx == -1:
        raise SystemExit("Bölüm 0 not found")
    insert_at = body.find("\n\n", idx)
    body = body[: insert_at + 2] + CHANGELOG_AFTER_AUTHORITY + body[insert_at + 2 :]

    old_env_start = body.find("### 0.2. Her işlem için Bible Compliance Envelope zorunludur")
    old_env_end = body.find("### 0.3. Hard gate ve soft rule ayrımı")
    if old_env_start == -1 or old_env_end == -1:
        raise SystemExit("envelope section not found")
    body = body[:old_env_start] + ENVELOPE_NOTE + body[old_env_end:]

    loop_at = body.find("GLOBAL CONTENT OS için sürekli çalışan bir **Bible Compliance Loop**")
    if loop_at == -1:
        raise SystemExit("compliance loop not found")
    body = body[:loop_at].rstrip() + "\n" + LOOP

    body = body.replace("00_TURK_TIP_CONTENT_OS_BIBLE_v3.md", "00_TURK_TIP_CONTENT_OS_BIBLE_v4.md")
    body = body.replace('bible_version: "3.0"', 'bible_version: "4.0"')

    out = body.rstrip() + "\n\n---\n\n" + book2.rstrip() + "\n"
    V4.write_text(out, encoding="utf-8")
    (HUB / "00_TURK_TIP_CONTENT_OS_BIBLE_v4.md").write_text(out, encoding="utf-8")
    V3.write_text(V3_STUB, encoding="utf-8")
    (HUB / "00_TURK_TIP_CONTENT_OS_BIBLE_v3.md").write_text(HUB_V3_STUB, encoding="utf-8")
    print(f"wrote {V4} ({len(out.splitlines())} lines)")
    print(f"wrote hub copy and v3 stubs; archived v3 -> {archived}")


if __name__ == "__main__":
    main()
