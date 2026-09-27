"""Öğrenci kademesi filtresi: A (öğrenci), B (bağlamsal), C (yurt dışı
hekimlik/denklik), D (asistan/trainee/fellow kariyer gelişimi — hâlâ
eğitimde olan), out (uzman/attending/YDUS-kadro)."""

from __future__ import annotations

import re
from dataclasses import dataclass

TIER_A = "A"
TIER_B = "B"
TIER_C = "C"
TIER_D = "D"
TIER_OUT = "out"

_NORMALIZE = str.maketrans(
    {
        "ı": "i",
        "İ": "i",
        "I": "i",
        "ş": "s",
        "Ş": "s",
        "ğ": "g",
        "Ğ": "g",
        "ü": "u",
        "Ü": "u",
        "ö": "o",
        "Ö": "o",
        "ç": "c",
        "Ç": "c",
    }
)


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").translate(_NORMALIZE).lower()).strip()


# Aynı sınavın farklı aşamaları (kılavuz, sınava giriş belgesi, sonuç,
# yerleştirme) genelde ortak bir "YYYY-SINAV N. Dönem" öneki paylaşır ama
# geri kalan başlık çok farklılaşabildiği için find_related'ın genel başlık
# benzerliği bunları her zaman yakalayamaz. Bu anahtar, sınav yaşam
# döngüsü birleştirmesi için ayrı ve daha güvenilir bir eşleştirme sağlar
# (2026-08-31 kararı).
EXAM_CYCLE_RE = re.compile(
    r"(\d{4}\s*[-–]\s*(?:TUS|YDUS|STS(?:\s+T[iı]p\s+Doktorlu[gğ]u)?|Y[OÖ]KD[İI]L|YDS|ALES|KPSS))"
    r"(\s*\d\s*\.\s*D[oö]nem)?",
    re.IGNORECASE,
)


def extract_exam_cycle_key(title: str) -> str | None:
    match = EXAM_CYCLE_RE.search(title or "")
    if not match:
        return None
    return normalize(match.group(0))


# "tus" bare substring olarak arandığında "TÜSEB" (normalize sonrası
# "tuseb") gibi kelimelerin İÇİNDE de eşleşir — " tus" "tuseb"'in bir
# önekidir. Kelime sınırı (harf/rakam olmayan komşu) zorunlu kılınır.
_TUS_WORD_RE = re.compile(r"(?<![a-z0-9])tus(?![a-z0-9])")


def has_tus_word(blob: str) -> bool:
    return bool(_TUS_WORD_RE.search(blob)) or "tipta uzmanlik sinavi" in blob


# "burs" kelimesi tek başına INCLUDE_A'ya konulamaz: "Bursa" (şehir) da
# normalize sonrası "burs" ile başlar ve "Bursa Uludağ Üniversitesi" gibi
# yüzlerce başlığı yanlışlıkla A'ya sokardı — TÜSEB/TUS hatasının aynısı.
# Negatif lookahead 'a' harfini eleyerek burs/bursu/burslar/burslu/
# bursiyer'i yakalar, bursa/bursalı/bursada'yı yakalamaz (2026-08-31).
_BURS_WORD_RE = re.compile(r"(?<![a-z])burs(?!a)")


def has_burs_word(blob: str) -> bool:
    return bool(_BURS_WORD_RE.search(blob))


# Asistan / uzman / yan dal — öğrencinin gündemi değil.
EXCLUDE_A = (
    "ydus",
    "yan dal",
    "yandal",
    "uzmanlik dali degisikligi",
    "uzmanlik dalı degisikligi",
    "asistan nakil",
    "asistan rotasyon",
    # "alımı"/"alım" gibi iyelik sonekli/soneksiz varyantların ikisini de
    # yakalamak için son harf(ler) bilerek kesildi (2026-08-31 düzeltmesi —
    # "Öğretim Üyesi Alım İlanı" başlığı "alimi" ile eşleşmiyordu).
    "arastirma gorevlisi alim",
    "ogretim uyesi alim",
    "ogretim gorevlisi ilan",
    "doktor ogretim uyesi",
    "sahu",  # sözleşmeli aile hekimliği uzmanlık — mezun hekim
    "pratisyen hekim",
)

# Yurt dışı hekimlik/denklik: ayrı ilgi alanı (C), varsayılan A kitlesi
# (TR tıp öğrencisi/intörn) ile karıştırılmaz. 2026-08-31 kararı: STS ve
# yabancı lisans sınavları artık "out" değil, ayrı C kademesinde izlenir.
STS_MARKERS = (
    "sts tip doktorlugu",
    "sts tıp doktorlugu",
    "sts-tip",
    "denklik sinavi",
)

FOREIGN_LICENSURE_MARKERS = STS_MARKERS + (
    "usmle",
    "ecfmg",
    "plab",
    "general medical council",
    "fachsprachprufung",
    "kenntnisprufung",
    "approbation",
    "mccqe",
    "medical council of canada",
    "australian medical council",
)

# Dönem 6'ya yakın bağlamsal.
TIER_B_MARKERS = (
    "mecburi hizmet",
    "intorn ucret",
    "intörn ücret",
    "intorn hekim ucret",
    "devlet hizmeti yukumlulugu",
    "devlet hizmeti yukumlugu",
)

# Öğrenci gündemi (dönem 1–6). TUS öğrencinin sınavı.
INCLUDE_A = (
    "akademik takvim",
    "yatay gecis",
    "ek madde",
    "kurul sinav",
    "ders kurulu",
    "staj",
    "intorn",
    "intörn",
    "donem gecme",
    "donem i ",
    "donem 1",
    "donem 2",
    "donem 3",
    "donem 4",
    "donem 5",
    "donem 6",
    "mezuniyet oncesi",
    "ogrenci isleri",
    "harc",
    "2209-a",
    "2209-b",
    "oryantasyon",
    "ders program",
    "sinav takvim",
    "sinav program",
    "sinav tarih",
    "ders kurulu sinav",
    "kurul sinavi",
    "staj sinav",
    "mazeret sinav",
    "butunleme",
    "ogrenci duyuru",
    "kayit takvim",
)


@dataclass(frozen=True)
class AudienceDecision:
    tier: str
    reason: str

    @property
    def enqueue(self) -> bool:
        return self.tier in {TIER_A, TIER_B, TIER_C, TIER_D}


def classify_text(title: str, body: str = "") -> AudienceDecision:
    titled = normalize(title)
    blob = normalize(f"{title} {body}")
    if not blob:
        return AudienceDecision(TIER_OUT, "empty")

    if "ydus" in titled:
        return AudienceDecision(TIER_OUT, "ydus_title")
    if "uzmanlik dali degisikligi" in titled or "uzmanlik dalı degisikligi" in titled:
        return AudienceDecision(TIER_OUT, "specialty_change_title")
    if any(marker in titled for marker in ("sts tip doktorlugu", "sts tıp doktorlugu", "sts-tip")):
        return AudienceDecision(TIER_C, "foreign_licensure_title")
    if "asistan nakil" in titled or "asistan rotasyon" in titled:
        return AudienceDecision(TIER_OUT, "assistant_title")

    if any(marker in blob for marker in FOREIGN_LICENSURE_MARKERS):
        has_tus = has_tus_word(blob)
        if not has_tus:
            return AudienceDecision(TIER_C, "foreign_licensure")

    exclusive_out = any(marker in blob for marker in EXCLUDE_A)
    student = (
        any(marker in blob for marker in INCLUDE_A)
        or has_tus_word(blob)
        or has_burs_word(blob)
    )

    if exclusive_out and not student:
        return AudienceDecision(TIER_OUT, "non_student_cadre")

    if any(marker in blob for marker in TIER_B_MARKERS):
        return AudienceDecision(TIER_B, "intern_context")

    if student:
        return AudienceDecision(TIER_A, "student_agenda")

    if any(x in blob for x in ("ihale", "mal alimi", "satinalma", "kadro ilani", "personel alimi")):
        return AudienceDecision(TIER_OUT, "admin_noise")

    return AudienceDecision(TIER_OUT, "no_student_signal")


# Resmi Gazete'nin gündelik "fihrist" sayfası her maddeyi "–– Başlık" olarak
# listeler ve bölüm başlıkları (YÖNETMELİK, TEBLİĞ, İLÂN BÖLÜMÜ vb.) TÜMÜ
# BÜYÜK HARF yazılır. Gerçek madde başlıkları ise Turkish Title Case
# olduğundan ("...İlişkin Tebliğ" gibi) büyük/küçük harf farkı, bölüm
# başlığını maddenin kendi metninden güvenilir şekilde ayırt etmeyi sağlar.
GAZETTE_SECTION_HEADERS = (
    "YÜRÜTME VE İDARE BÖLÜMÜ", "YASAMA BÖLÜMÜ", "YARGI BÖLÜMÜ",
    "İLÂN BÖLÜMÜ", "İLAN BÖLÜMÜ",
    "CUMHURBAŞKANLIĞI KARARNAMESİ", "CUMHURBAŞKANLIĞI KARARI",
    "YÖNETMELİKLER", "TEBLİĞLER", "KARARLAR",
    "YÖNETMELİK", "TEBLİĞ", "KARAR", "GENELGE", "TÜZÜK", "KANUN",
)


def extract_gazette_items(text: str) -> list[str]:
    parts = (text or "").split("––")
    items: list[str] = []
    seen: set[str] = set()
    for chunk in parts[1:]:
        title = chunk.strip()
        cut = len(title)
        for header in GAZETTE_SECTION_HEADERS:
            idx = title.find(header)
            if idx != -1:
                cut = min(cut, idx)
        title = title[:cut].strip(" .")
        if len(title) < 15:
            continue
        key = title.lower()
        if key not in seen:
            seen.add(key)
            items.append(title)
    return items


# Resmi Gazete maddelerinde tıp öğrencisini ilgilendirebilecek ek işaretler.
# Genel INCLUDE_A'ya eklenmez: personel/ihale ilanı gibi alakasız
# kategorilerde yanlış eşleşmeyi önlemek için yalnızca "legislation"
# kategorisinde ve classify_text hiçbir şeye karar veremediğinde devreye
# girer (bkz. classify_for_queue).
LEGISLATION_STUDENT_MARKERS = (
    "tip fakultesi",
    "tip egitimi",
    "tip ogrencisi",
    "mezuniyet oncesi tip egitimi",
    "tipta uzmanlik egitimi",
    "yuksekogretim kurumlari sinav",
    "universitelerarasi kurul",
    "tipta uzmanlik sinavi",
    # 2026-08-31: kullanıcının belirttiği genişletilmiş anahtar kelime
    # listesi. Bilerek dışarıda bırakılanlar: "tabip", "hekim", "uzmanlik
    # egitimi" (bare) — bunlar personel/ihale ilanlarında da geçtiği için
    # (ör. "Aile Hekimi Alım İlanı") yanlış pozitif riski çok yüksek.
    "3359",  # Sağlık Hizmetleri Temel Kanunu
    "1219 sayili",  # Tababet ve Şuabatı San'atlarının Tarzı İcrasına Dair Kanun
    "2547 sayili",  # Yükseköğretim Kanunu
    "ogrenci affi",
    "azami sure",
    "klinik arastirma",
    "ogrenci bursu",
)


NOTICE_RE = re.compile(
    r"20\d{2}\s*[-–]?\s*(?:TUS|YDUS|STS)[^.\n]{0,90}"
    r"|uzmanl[iı]k dal[iı] de[gğ]i[sş]ikli[gğ]i[^.\n]{0,60}",
    re.IGNORECASE,
)


def extract_notice_titles(text: str) -> list[str]:
    found: list[str] = []
    seen: set[str] = set()
    for match in NOTICE_RE.finditer(text or ""):
        title = re.sub(r"\s+", " ", match.group(0)).strip()
        key = normalize(title)
        if key and key not in seen:
            seen.add(key)
            found.append(title)
    return found


def classify_for_queue(category: str, title: str, body: str = "") -> AudienceDecision:
    decision = classify_text(title, body[:8000])
    if category == "faculty_announcement" and decision.reason == "no_student_signal":
        return AudienceDecision(TIER_A, "faculty_listing")
    if category == "accreditation" and decision.reason == "no_student_signal":
        return AudienceDecision(TIER_A, "accreditation_listing")
    if category == "legislation" and decision.reason == "no_student_signal":
        blob = normalize(f"{title} {body[:8000]}")
        if any(marker in blob for marker in LEGISLATION_STUDENT_MARKERS):
            return AudienceDecision(TIER_A, "legislation_student_relevant")
    if category == "scholarship_research" and decision.reason == "no_student_signal":
        # İngilizce yurt dışı burs kaynakları (ESKAS, JSPS, Humboldt, EMBO,
        # MSCA, GKS, Campus France...) "burs" kelimesini hiç içermiyor.
        # Bu işaretler bilerek INCLUDE_A'ya konulmadı, yalnızca burs
        # kaynaklarında geçerli: aksi halde "EANS ... Fellowship Programı"
        # gibi asistan duyuruları D yerine A'ya düşerdi (2026-08-31).
        blob = normalize(f"{title} {body[:8000]}")
        if any(marker in blob for marker in ("scholarship", "fellowship", "burs programi")):
            return AudienceDecision(TIER_A, "scholarship_listing")
    if category == "trainee_opportunity" and decision.reason == "no_student_signal":
        # Asistan/trainee/fellow için (hâlâ eğitimde) fellowship, board sınavı,
        # kongre bursu, travel grant duyuran uzmanlık dernekleri ve
        # organizasyonları — 2026-08-31 kararı (D kademesi). Uzman/attending
        # düzeyi hâlâ EXCLUDE_A üzerinden elenir (ör. "ogretim uyesi alimi").
        return AudienceDecision(TIER_D, "trainee_opportunity_listing")
    return decision
