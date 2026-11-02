"""Owner PASS/FAIL interview 2026-11-02 (Bible 26.1) for Medikal Akademi, Sağlık Aktüel, TEMD, TUTD, TND, Güvenilir Gıda.

Fixtures are saved live pages/feeds. Every decision asserted here is an owner answer on a real title, not a keyword guess:
society legs take kongre/kurs, kılavuz/rapor yayını and health/national special days; webinar series (Endokrin Akademi), surveys,
condolences and member-achievement news are rejected; Medikal Akademi keeps clinical/literature + new drug/device + guideline
news but rejects reimbursement and sector/advertorial text; Sağlık Aktüel keeps only clinical/scientific development.
"""
from __future__ import annotations

import unittest
from pathlib import Path

from radar.phase1_ingestion_canary import parse_raw_items
from radar.tip_toplulugu_continuous_runner import export_automation_ready_profiles
from radar.tip_toplulugu_fetch import classify_with_congress_gate

FX = Path(__file__).parent / "fixtures" / "association_sources"
PROFILES = {p["source_id"]: p for p in export_automation_ready_profiles()}


def parse(name: str, url: str):
    return parse_raw_items(source_id="x", source_url=url, body=(FX / name).read_text(encoding="utf-8"), fetch_method="GET", fetched_at="2026-11-02T00:00:00Z")


def decide(sid: str, title: str, body: str = "") -> str:
    return classify_with_congress_gate(PROFILES[sid], title=title, body=body).decision


class ParserTests(unittest.TestCase):
    def test_tutd_rows_have_clean_titles_and_turkish_short_month_dates(self):
        items = parse("tutd_haberler.html", "https://www.tutd.org.tr/haberler")
        self.assertEqual(len(items), 20)
        first = items[0]
        self.assertEqual(first.title, "Sirkadiyen Ritmi ve Uykuyu Destekleyen Işık Alışkanlıkları")  # "Yeni" badge is not part of the title
        self.assertEqual(first.published_at, "2026-10-27")
        self.assertTrue(all(i.canonical_item_url.startswith("https://www.tutd.org.tr/haber/") for i in items))
        self.assertTrue(all(i.published_at for i in items))

    def test_gida_cards_take_the_post_date_not_a_date_inside_the_title(self):
        items = parse("gida_dogru_bilgi_arsiv.html", "https://guvenilirgida.tarimorman.gov.tr/Haber/Arsiv/")
        self.assertEqual(len(items), 8)
        etiket = next(i for i in items if "Etiketlemede" in i.title)
        self.assertEqual(etiket.published_at, "2026-10-09")  # title says "31 Aralık 2026" (deadline), post date is 9 Ekim
        self.assertIn("Ürün", next(i for i in items if "Konserve Yapılan" in i.title).title)  # HTML entities decoded
        self.assertTrue(all("/Haber/Detay/" in i.canonical_item_url for i in items))

    def test_temd_list_items_carry_publication_dates(self):
        items = [i for i in parse("temd_duyurular.html", "https://www.temd.org.tr/duyurular") if "/haberler/" in i.canonical_item_url]
        self.assertGreaterEqual(len(items), 90)
        dated = next(i for i in items if "UZLAŞI RAPORU 2025 YAYINLANDI" in i.title)
        self.assertEqual(dated.published_at, "2025-12-04")

    def test_tnd_table_rows_carry_dates(self):
        items = parse("tnd_haberler.html", "https://noroloji.org.tr/haberler")
        board = next(i for i in items if "BOARD" in i.title)
        self.assertEqual(board.published_at, "2026-10-27")


class SocietyPolicyTests(unittest.TestCase):
    def test_temd_duyuru_leg_takes_guideline_and_consensus_report_publications_only(self):
        self.assertEqual(decide("temd_duyuru", "TÜRK HİPERTANSİYON UZLAŞI RAPORU 2025 YAYINLANDI"), "ACCEPT")
        for t in ("ENDOKRİN AKADEMİ - EASD 2026’DA NELER KONUŞULDU?", "WEBİNAR DUYURUSU - TÜRK HİPERTANSİYON UZLAŞI RAPORU", "48. TÜRKİYE ENDOKRİNOLOJİ VE METABOLİZMA HASTALIKLARI KONGRESİ"):
            with self.subTest(t):
                self.assertEqual(decide("temd_duyuru", t), "DISCARD")

    def test_temd_egitim_leg_takes_congress_symposium_course(self):
        for t in ("48. TÜRKİYE ENDOKRİNOLOJİ VE METABOLİZMA HASTALIKLARI KONGRESİ", "13. ADRENAL GONAD VE NÖROENDOKRİN TÜMÖRLER SEMPOZYUMU - Hibrit", "TİROKURS-34 PRATİK TİROİDOLOJİ KURSU"):
            with self.subTest(t):
                self.assertEqual(decide("egitim_temd", t), "ACCEPT")
        self.assertEqual(decide("egitim_temd", "ENDOKRİN AKADEMİ - OSTEOPOROZ TEDAVİSİNDE ANABOLİK YAKLAŞIM"), "DISCARD")

    def test_temd_special_day_leg(self):
        self.assertEqual(decide("temd_ozelgun", "24 EYLÜL AİLESEL HİPERKOLESTEROLEMİ GÜNÜ"), "ACCEPT")
        self.assertEqual(decide("temd_ozelgun", "TEMD 14 KASIM DÜNYA DİYABET GÜNÜ BASIN BİLDİRİSİ"), "ACCEPT")
        self.assertEqual(decide("temd_ozelgun", "ENDOKRİN AKADEMİ - CUSHİNG SENDROMU FARKINDALIK GÜNÜ ETKİNLİĞİ"), "DISCARD")

    def test_tutd_legs_split_by_owner_types(self):
        self.assertEqual(decide("tutd_duyuru", "Yeterlilik Sınavına Girecek Adaylara Duyuru"), "ACCEPT")
        self.assertEqual(decide("tutd_uyku_yazilari", "Çocuklarda Sağlıklı Uyku"), "ACCEPT")
        self.assertEqual(decide("tutd_uyku_yazilari", "Magnezyum Uykuma İyi Gelir mi?"), "ACCEPT")
        self.assertEqual(decide("tutd_ozelgun", "29 Ekim Cumhuriyet Bayramımız Kutlu Olsun"), "ACCEPT")
        for sid in ("tutd_duyuru", "tutd_uyku_yazilari", "tutd_ozelgun", "egitim_tutd"):
            for t in ("Çocuklarda Melatonin Kullanımı Anketi", "Haftanın sorusu: 26.10.2026", "Vefat ve Başsağlığı"):
                with self.subTest(sid=sid, title=t):
                    self.assertEqual(decide(sid, t), "DISCARD")

    def test_tnd_legs_split_by_owner_types(self):
        self.assertEqual(decide("tnd_duyuru", "YETERLİK SINAVI (BOARD) DUYURUSU"), "ACCEPT")
        self.assertEqual(decide("egitim_tnd", "TND-İntraoperatif Nöromonitorizasyon-Hekim Kursu"), "ACCEPT")
        self.assertEqual(decide("tnd_bilimsel", "“İDİYOPATİK PARKİNSON HASTALIĞININ ERKEN TANISI İÇİN ÇOK MODLU YAPAY ZEKA SİSTEMİ VE YÖNTEMİ” patent almaya hak kazandı."), "ACCEPT")
        self.assertEqual(decide("tnd_ozelgun", "Kurban Bayramınız Kutlu Olsun"), "ACCEPT")
        for sid in ("tnd_duyuru", "egitim_tnd", "tnd_bilimsel", "tnd_ozelgun"):
            with self.subTest(sid=sid):
                self.assertEqual(decide(sid, "Acı Kaybımız: Prof. Dr. Coşkun Özdemir"), "DISCARD")
        for sid in ("tnd_duyuru", "tnd_bilimsel"):
            with self.subTest(sid=sid):
                self.assertEqual(decide(sid, "(ECTRIMS) Yönetim Kuruluna Prof.Dr.Aksel Siva seçilmiştir."), "DISCARD")  # person news, not a clinical result


class NewsPolicyTests(unittest.TestCase):
    def test_medikal_akademi_keeps_literature_and_rejects_advertorial_and_reimbursement(self):
        self.assertEqual(decide("medikal_akademi", "Günde 3 Bin Adım Yürümek Alzheimer’a Bağlı Bilişsel Gerilemeyi Önemli Oranda Durduruyor!", "Nature Medicine dergisinde yeni yayımlanan bir araştırmaya göre"), "ACCEPT")
        self.assertEqual(decide("medikal_akademi", "Kronik Ağrı Tedavisinde Yeni Umut: İğneyle Enjekte Edilebilen Elektronik İmplant"), "ACCEPT")
        for t, b in (
            ("En İyi 10 Fraksiyonel Lazer Merkezi", "Sivilce izlerinden kurtulmak için tedavi araştırması"),
            ("Laptop Alan Yerler", "Kullanılmayan bir dizüstü bilgisayarı satarken"),
            ("Meme Kanseri Belirtileri Nelerdir?", "Meme kanseri, kadınlarda en sık görülen kanser türüdür"),
            ("Bazı ilaçlar için geri ödeme listesi değişti", "ilaç geri ödeme"),
        ):
            with self.subTest(t):
                self.assertEqual(decide("medikal_akademi", t, b), "DISCARD")

    def test_saglik_aktuel_takes_only_clinical_scientific_development(self):
        self.assertEqual(decide("saglik_aktuel_bilimsel", "Yeni tedavi: faz 3 klinik çalışma sonuçları dergisinde yayımlandı", "bilim insanları"), "ACCEPT")
        for t in (
            "Sağlık Bakanı Memişoğlu'ndan Düzce ve Zonguldak'ta Sağlık Yatırımları",
            "Sahte ve Tarihi Geçmiş Kanser İlacı Çetesine Operasyon: 650 Milyon TL'lik Vurgun",  # owner: sahte ilaç haberi RED here
            "Türkiye ile KKTC Arasında Sağlıkta Güç Birliği: 2026-2028 Eylem Planı İmzalandı",
            "Annesinin Kanseri Sayesinde Bilinçlendi: Erkek Hasta Erken Evre Meme Kanseriyle Ameliyat Edilerek Sağlığına Kavuştu",
        ):
            with self.subTest(t):
                self.assertEqual(decide("saglik_aktuel_bilimsel", t), "DISCARD")

    def test_guvenilir_gida_keeps_information_posts_but_not_app_promotion(self):
        self.assertEqual(decide("guvenilirgida_dogru_bilgi", "E Kodları Nedir?"), "ACCEPT")
        self.assertEqual(decide("guvenilirgida_dogru_bilgi", "16 Ekim Dünya Gıda Günü"), "ACCEPT")
        self.assertEqual(decide("guvenilirgida_dogru_bilgi", "Güvenilir Gıda Mobil Uygulaması"), "DISCARD")


class RegistrationTests(unittest.TestCase):
    def test_all_fourteen_legs_are_registered_with_their_lane_flags(self):
        haber = {"medikal_akademi", "saglik_aktuel_bilimsel", "guvenilirgida_dogru_bilgi", "tutd_uyku_yazilari", "tutd_ozelgun", "temd_ozelgun", "tnd_bilimsel", "tnd_ozelgun"}
        egitim = {"egitim_temd", "egitim_tutd", "egitim_tnd"}
        duyuru = {"temd_duyuru", "tutd_duyuru", "tnd_duyuru"}
        self.assertTrue((haber | egitim | duyuru) <= set(PROFILES))
        for sid in egitim:
            self.assertTrue(PROFILES[sid]["allow_congress"], sid)  # owner accepts kongre/sempozyum/kurs announcements
        for sid in haber | duyuru:
            self.assertFalse(PROFILES[sid]["allow_congress"], sid)


if __name__ == "__main__":
    unittest.main()
