from __future__ import annotations

import unittest

from radar.fetchers import extract_html_text
from radar.models import Source

SOURCE = Source(
    id="test", name="Test", institution="Üniversite", category="faculty_announcement",
    url="https://example.edu.tr", official=True,
)


class EncodingTests(unittest.TestCase):
    def test_utf8_bytes_without_charset_header_decode_correctly(self):
        # Sunucu Content-Type'ta charset belirtmediğinde requests.text
        # ISO-8859-1'e düşüp Türkçe karakterleri bozardı (mojibake).
        # extract_html_text artık ham bytes alıp BeautifulSoup'a kendi
        # encoding tespitini yaptırıyor.
        html = "<html><body><main>VAN YÜZÜNCÜ YIL ÜNİVERSİTESİ TIP FAKÜLTESİ Öğrenci İşleri Duyurusu</main></body></html>"
        raw_bytes = html.encode("utf-8")
        text, _ = extract_html_text(raw_bytes, SOURCE)
        self.assertIn("VAN YÜZÜNCÜ YIL ÜNİVERSİTESİ", text)
        self.assertNotIn("Ã", text)

    def test_utf8_meta_charset_decodes_correctly(self):
        html = (
            '<html><head><meta charset="utf-8"></head>'
            "<body><main>Öğrenci Duyuruları: Yatay Geçiş Sonuçları Açıklandı</main></body></html>"
        )
        raw_bytes = html.encode("utf-8")
        text, _ = extract_html_text(raw_bytes, SOURCE)
        self.assertIn("Öğrenci Duyuruları", text)
        self.assertIn("Açıklandı", text)

    def test_str_input_still_works(self):
        html = "<html><body><main>Basit metin</main></body></html>"
        text, _ = extract_html_text(html, SOURCE)
        self.assertIn("Basit metin", text)


if __name__ == "__main__":
    unittest.main()
