from __future__ import annotations

import hashlib
import io
import re
import ssl
from dataclasses import replace
from datetime import datetime, timezone
from urllib.parse import urlparse

import requests
import urllib3
from bs4 import BeautifulSoup
from pypdf import PdfReader
from requests.adapters import HTTPAdapter

from .deadlines import ISTANBUL_TZ
from .models import FetchResult, Source


def resolve_url(url: str) -> str:
    """Kaynak URL'sindeki {today} yer tutucusunu İstanbul saatiyle bugünün
    tarihine (YYYY-MM-DD) çevirir. Resmî Gazete gibi günlük fihrist sayfası
    olan kaynaklarda kullanılır."""
    if "{today}" in url:
        today = datetime.now(ISTANBUL_TZ).strftime("%Y-%m-%d")
        return url.replace("{today}", today)
    return url

# Sertifikası bozuk/geçersiz olduğu doğrulanmış resmî .edu.tr / .gov.tr
# sunucuları. Doğrulama yalnızca bu domainler için kapatılır; site kendisi
# resmî ve gerçek, sorun sunucunun TLS yapılandırmasında.
INSECURE_TLS_HOSTS = {
    "www.resmigazete.gov.tr",
    "tip.afsu.edu.tr",
    "tip.duzce.edu.tr",
    "tip.ikcu.edu.tr",
    "tip.inonu.edu.tr",
    "tip.trakya.edu.tr",
    "www.ttb.org.tr",
    "www.tsrm.org.tr",
    "www.gaziantep.bel.tr",
    "www.tekirdag.bel.tr",
}

# Sertifikaları geçerli ama sunucu tarafında sadece eski/küçük DH anahtarı
# destekleyen resmî domainler. Sertifika doğrulaması açık kalır; yalnızca
# OpenSSL güvenlik seviyesi bu bağlantı için düşürülür.
WEAK_DH_HOSTS = {
    "www.yyu.edu.tr",
}


class _WeakDHAdapter(HTTPAdapter):
    def init_poolmanager(self, *args, **kwargs):
        ctx = ssl.create_default_context()
        ctx.set_ciphers("DEFAULT:@SECLEVEL=1")
        kwargs["ssl_context"] = ctx
        return super().init_poolmanager(*args, **kwargs)


def normalize_text(value: str) -> str:
    value = re.sub(r"\s+", " ", value)
    return value.strip()


# Türk üniversite sitelerinin (Sitefinity, WordPress, özel CMS) ortak
# şablonlarında menü/gezinme/altbilgi genelde bu etiket veya class/id
# desenleriyle işaretlenir. content_selector tanımlanmamış kaynaklarda
# duyuru metnini menü çöpünden ayıklamak için genel bir gürültü filtresi.
NOISE_TAGS = ["script", "style", "nav", "footer", "noscript"]
# Tam class/id token eşleşmesi kullanılır (substring değil) — aksi halde
# "menu-text-align-center" gibi tema yardımcı class'ları (ör. WordPress
# Avada'nın <body>'ye eklediği onlarca stil sınıfı) yanlışlıkla eşleşip
# sayfanın tamamını siler.
NOISE_CLASS_TOKENS = {
    "menu", "navbar", "nav", "breadcrumb", "breadcrumbs",
    "site-header", "site-footer", "skip-link", "topbar", "mega-menu",
    "search-form", "social-links", "cookie-notice", "cookie-banner",
}
# "sidebar" bilerek dışarıda bırakıldı: bazı üniversite temalarında (ör.
# WordPress "recent posts" widget'ı) gerçek duyuru listesi tam olarak
# class="sidebar" içinde render ediliyor; kaldırmak içeriği tamamen siliyordu.
CONTENT_SELECTOR_CANDIDATES = [
    "main", "article", "[role=main]", "#content", ".content", ".icerik",
    ".sayfa-icerik", ".entry-content", ".post-content", ".duyuru-detay",
    ".duyuru-listesi", ".page-content",
]


def _strip_noise(soup: BeautifulSoup) -> None:
    for tag in soup(NOISE_TAGS):
        tag.decompose()
    for element in soup.find_all(True):
        if element.attrs is None or element.name in ("html", "body"):
            continue  # decompose edilmiş düğümler veya belge kökü asla silinmez
        classes = {c.lower() for c in (element.get("class") or [])}
        element_id = (element.get("id") or "").lower()
        if classes & NOISE_CLASS_TOKENS or element_id in NOISE_CLASS_TOKENS:
            element.decompose()


def extract_html_text(html: str | bytes, source: Source) -> tuple[str, str]:
    # bytes verilince BeautifulSoup kendi encoding tespitini (meta charset,
    # BOM, chardet) yapar. requests'in response.text'i, sunucu Content-Type
    # header'ında charset belirtmediğinde HTTP spesifikasyonu gereği
    # ISO-8859-1'e düşer; bu da UTF-8 Türkçe sayfalarda mojibake üretir.
    soup = BeautifulSoup(html, "html.parser")
    title = normalize_text(soup.title.get_text(" ", strip=True)) if soup.title else source.name
    _strip_noise(soup)
    target = soup.select_one(source.content_selector) if source.content_selector else None
    if not target:
        for selector in CONTENT_SELECTOR_CANDIDATES:
            target = soup.select_one(selector)
            if target and len(target.get_text(strip=True)) >= 80:
                break
        else:
            target = None
    target = target or soup.body or soup
    text = normalize_text(target.get_text(" ", strip=True))
    return text, title


def build_result(source: Source, text: str, title: str, status_code: int) -> FetchResult:
    if len(text) < 80:
        raise ValueError("Kaynakta yeterli okunabilir metin bulunamadı")
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
    return FetchResult(
        source=source,
        content=text,
        content_hash=digest,
        fetched_at=datetime.now(timezone.utc).isoformat(),
        status_code=status_code,
        title=title,
    )


def fetch(source: Source, user_agent: str, timeout: int = 30) -> FetchResult:
    resolved_url = resolve_url(source.url)
    if resolved_url != source.url:
        # Kaydedilen aday, editörün tıklayabileceği gerçek (o güne ait)
        # bağlantıyı göstersin diye source objesi çözümlenmiş URL ile
        # değiştirilir; orijinal kayıt (sources listesindeki) etkilenmez.
        source = replace(source, url=resolved_url)
    if source.source_type == "browser":
        from .browser_fetcher import fetch_with_browser

        return fetch_with_browser(source, user_agent, timeout)
    host = urlparse(source.url).hostname
    verify = host not in INSECURE_TLS_HOSTS
    if not verify:
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    headers = {"User-Agent": user_agent, "Accept-Language": "tr-TR,tr;q=0.9"}
    if host in WEAK_DH_HOSTS:
        session = requests.Session()
        session.mount("https://", _WeakDHAdapter())
        response = session.get(source.url, headers=headers, timeout=timeout, verify=verify)
    else:
        response = requests.get(source.url, headers=headers, timeout=timeout, verify=verify)
    response.raise_for_status()
    content_type = response.headers.get("content-type", "").lower()
    is_pdf = source.source_type == "pdf" or "application/pdf" in content_type
    if is_pdf:
        reader = PdfReader(io.BytesIO(response.content))
        text = normalize_text("\n".join((page.extract_text() or "") for page in reader.pages))
        title = source.name
    else:
        text, title = extract_html_text(response.content, source)
    return build_result(source, text, title, response.status_code)

