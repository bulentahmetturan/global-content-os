from __future__ import annotations

import unittest

from radar.audience import (
    classify_for_queue,
    classify_text,
    extract_exam_cycle_key,
    extract_gazette_items,
    extract_notice_titles,
)


class AudienceTests(unittest.TestCase):
    def test_ydus_out(self):
        decision = classify_text("2026-YDUS Ek Yerleştirme Sonuçları")
        self.assertEqual(decision.tier, "out")
        self.assertFalse(decision.enqueue)

    def test_specialty_change_out(self):
        decision = classify_text("2026-TUS 1. Dönem: Uzmanlık Dalı Değişikliği")
        self.assertEqual(decision.tier, "out")

    def test_tus_in(self):
        decision = classify_text("2026-TUS 1. Dönem Kılavuzu yayımlandı")
        self.assertEqual(decision.tier, "A")
        self.assertTrue(decision.enqueue)

    def test_sts_is_foreign_licensure_tier_c(self):
        decision = classify_text("2026 STS Tıp Doktorluğu Başvuruları")
        self.assertEqual(decision.tier, "C")
        self.assertTrue(decision.enqueue)

    def test_usmle_is_tier_c(self):
        decision = classify_text("USMLE Step 1 Kayıt Ücretlerinde Değişiklik")
        self.assertEqual(decision.tier, "C")

    def test_plab_is_tier_c(self):
        decision = classify_text("PLAB 1 Sınav Merkezi Değişikliği Duyurusu")
        self.assertEqual(decision.tier, "C")

    def test_sts_in_title_is_tier_c_even_if_tus_also_mentioned(self):
        # Başlıkta STS ifadesi geçiyorsa (TUS aynı metinde geçse bile) karar
        # başlık seviyesinde kesinleşir: bu, ayrı duyuruları (TUS kendi
        # başlığıyla, STS kendi başlığıyla) tek tek değerlendiren
        # extract_notice_titles/extract_gazette_items ile birlikte çalışır.
        decision = classify_text("2026-TUS 1. Dönem kılavuzu ve STS Tıp Doktorluğu bilgilendirmesi")
        self.assertEqual(decision.tier, "C")

    def test_intern_pay_is_b(self):
        decision = classify_text("İntörn ücreti ödeme duyurusu")
        self.assertEqual(decision.tier, "B")

    def test_calendar_is_a(self):
        decision = classify_text("2026-2027 Akademik Takvim yayımlandı")
        self.assertEqual(decision.tier, "A")

    def test_mixed_osym_page_splits(self):
        body = (
            "2026-YDUS Ek Yerleştirme Sonuçları açıklandı. "
            "2026-TUS 1. Dönem kılavuzu yayımlandı. "
            "2026-TUS 1. Dönem Uzmanlık Dalı Değişikliği duyurusu."
        )
        titles = extract_notice_titles(body)
        self.assertGreaterEqual(len(titles), 2)
        kept = [t for t in titles if classify_for_queue("central_announcement", t, "").enqueue]
        self.assertTrue(any("TUS" in t and "YDUS" not in t.upper() for t in kept) or any("TUS" in t for t in kept))
        dropped = [t for t in titles if not classify_for_queue("central_announcement", t, "").enqueue]
        self.assertTrue(any("YDUS" in t.upper() for t in dropped))

    def test_faculty_listing_defaults_to_a(self):
        decision = classify_for_queue("faculty_announcement", "Tıp Fakültesi", "Dekanlık iletişim bilgileri")
        self.assertEqual(decision.tier, "A")

    def test_extract_gazette_items_splits_and_trims_section_headers(self):
        text = (
            "YÜRÜTME VE İDARE BÖLÜMÜ YÖNETMELİK "
            "–– Ankara Yıldırım Beyazıt Üniversitesi Öğrenme ve Öğretme Uygulama ve Araştırma Merkezi Yönetmeliği "
            "TEBLİĞ "
            "–– Ambulans ve Acil Bakım Teknikerleri ile Acil Tıp Teknisyenlerinin Çalışma Usul ve Esaslarına "
            "Dair Tebliğde Değişiklik Yapılmasına İlişkin Tebliğ "
            "İLÂN BÖLÜMÜ a - Artırma, Eksiltme ve İhale İlânları"
        )
        items = extract_gazette_items(text)
        self.assertEqual(len(items), 2)
        self.assertTrue(items[0].endswith("Yönetmeliği"))
        self.assertTrue(items[1].endswith("İlişkin Tebliğ"))
        self.assertNotIn("İLÂN BÖLÜMÜ", items[1])

    def test_extract_gazette_items_ignores_short_fragments(self):
        text = "İLAN BÖLÜMÜ –– Kısa –– " + "x" * 30
        items = extract_gazette_items(text)
        self.assertNotIn("Kısa", items)

    def test_gazette_medical_faculty_regulation_is_a(self):
        decision = classify_for_queue(
            "legislation",
            "Dokuz Eylül Üniversitesi Tıp Fakültesi Eğitim ve Öğretim Yönetmeliğinde Değişiklik Yapılmasına Dair Yönetmelik",
            "",
        )
        self.assertEqual(decision.tier, "A")
        self.assertEqual(decision.reason, "legislation_student_relevant")

    def test_gazette_unrelated_tender_stays_out(self):
        decision = classify_for_queue(
            "legislation", "Sağlık Bakanlığından: Malzeme Alımı İhale İlanı", ""
        )
        self.assertEqual(decision.tier, "out")

    def test_gazette_2547_law_change_is_a(self):
        decision = classify_for_queue(
            "legislation",
            "2547 Sayılı Yükseköğretim Kanununun Bazı Maddelerinde Değişiklik Yapılmasına Dair Kanun",
            "",
        )
        self.assertEqual(decision.tier, "A")

    def test_gazette_ogrenci_affi_is_a(self):
        decision = classify_for_queue(
            "legislation", "Yükseköğretim Kurumlarında Öğrenci Affı Uygulanmasına Dair Yönetmelik", ""
        )
        self.assertEqual(decision.tier, "A")

    def test_tuseb_mention_alone_does_not_trigger_tus_match(self):
        # Regresyon: " tus" alt dizisi "TÜSEB" (normalize sonrası "tuseb")
        # kelimesinin içinde de geçiyordu, BAP/TTO sayfalarındaki rutin
        # "TÜBİTAK, TÜSEB, İSTKA" finansman kaynağı listesini yanlışlıkla
        # A'ya düşürüyordu.
        decision = classify_text(
            "Bilimsel Araştırma Projeleri", "Dış kaynaklı destekler: TÜBİTAK, Ufuk Avrupa, TÜSEB, İSTKA"
        )
        self.assertEqual(decision.tier, "out")

    def test_standalone_tus_word_still_detected(self):
        decision = classify_text("(TUS)", "Sınav başvuruları başladı.")
        self.assertEqual(decision.tier, "A")

    def test_faculty_hiring_ad_excluded_regardless_of_suffix(self):
        # Regresyon: EXCLUDE_A "alimi" iyelik sonekini zorunlu tutuyordu,
        # "Alım İlanı" (soneksiz) formunu kaçırıyordu.
        for title in ("Öğretim Üyesi Alım İlanı", "Öğretim Üyesi Alımı İlanı"):
            decision = classify_for_queue("trainee_opportunity", title, "")
            self.assertEqual(decision.tier, "out", title)

    def test_trainee_opportunity_defaults_to_tier_d(self):
        decision = classify_for_queue(
            "trainee_opportunity",
            "EANS Nöroşirürji Asistanları için Fellowship Programı Başvuruları Açıldı",
            "",
        )
        self.assertEqual(decision.tier, "D")
        self.assertTrue(decision.enqueue)

    def test_exam_cycle_key_groups_different_stages(self):
        guide = extract_exam_cycle_key("2026-TUS 1. Dönem Kılavuzu ve Başvuru Bilgileri")
        entry_doc = extract_exam_cycle_key("2026-TUS 1. Dönem: Sınava Giriş Belgeleri Erişime Açıldı")
        result = extract_exam_cycle_key("2026-TUS 1. Dönem Yerleştirme Sonuçları Açıklandı")
        self.assertIsNotNone(guide)
        self.assertEqual(guide, entry_doc)
        self.assertEqual(guide, result)

    def test_exam_cycle_key_distinguishes_different_periods(self):
        first = extract_exam_cycle_key("2026-TUS 1. Dönem Kılavuzu")
        second = extract_exam_cycle_key("2026-TUS 2. Dönem Kılavuzu")
        self.assertNotEqual(first, second)

    def test_exam_cycle_key_none_for_unrelated_title(self):
        self.assertIsNone(extract_exam_cycle_key("Akademik Takvim Yayımlandı"))

    def test_burs_announcement_is_student_agenda(self):
        # Burs kaynaklarının duyuruları önceden tamamen eleniyordu (KYGM,
        # TEV, Kızılay, TÜBİTAK 2242, yurt dışı burslar dahil) — 2026-08-31.
        for title in (
            "2027 Fulbright Yüksek Lisans ve Doktora Bursu Başvuruları Başladı",
            "Jean Monnet Burs Programı 2026-2027 Başvuruları",
            "2026 YLSY Yurt Dışı Lisansüstü Eğitim Burs Başvuruları",
            "Bursiyer Ödemeleri Hakkında Duyuru",
        ):
            decision = classify_for_queue("scholarship_research", title, "")
            self.assertEqual(decision.tier, "A", title)

    def test_ders_kurulu_exam_announcements_are_tier_a(self):
        # Tıp öğrencisinin günlük gündeminin merkezi: ders kurulu / staj
        # sınav takvimi ve mazeret sınavı duyuruları (2026-09-01).
        for title in (
            "Dönem 3 IV. Ders Kurulu Sınav Tarihi Değişikliği",
            "Final Sınav Programı Güncellendi",
            "Dönem 2 Mazeret Sınavı Duyurusu",
            "Dönem 5 Staj Sınavı Tarihleri",
        ):
            decision = classify_for_queue("central_announcement", title, "")
            self.assertEqual(decision.tier, "A", title)

    def test_english_scholarship_pages_are_queued(self):
        # İngilizce yurt dışı burs sayfaları "burs" içermediği için
        # tamamen eleniyordu (ESKAS, EMBO, MSCA, JSPS...) — 2026-08-31.
        for title in (
            "Swiss Government Excellence Scholarships 2027-2028",
            "EMBO Postdoctoral Fellowships call for applications open",
        ):
            decision = classify_for_queue("scholarship_research", title, "")
            self.assertEqual(decision.tier, "A", title)
            self.assertEqual(decision.reason, "scholarship_listing")

    def test_english_fellowship_marker_does_not_override_trainee_tier(self):
        # "fellowship" işareti INCLUDE_A'ya konulsaydı asistan duyuruları
        # D yerine A'ya düşerdi; bu yüzden yalnızca burs kategorisinde geçerli.
        decision = classify_for_queue(
            "trainee_opportunity", "EANS Nöroşirürji Asistanları için Fellowship Programı", ""
        )
        self.assertEqual(decision.tier, "D")

    def test_bursa_city_name_does_not_trigger_burs_match(self):
        # Regresyon: "burs" alt dizisi "Bursa" şehir adının içinde de geçiyor;
        # TÜSEB/TUS hatasının aynısını burs için tekrarlamamak lazım.
        for title in (
            "Bursa Büyükşehir Belediyesi Yol Çalışması Duyurusu",
            "Bursa Valiliğinden İhale İlanı",
        ):
            decision = classify_for_queue("central_announcement", title, "")
            self.assertEqual(decision.tier, "out", title)

    def test_gazette_bare_hekim_stays_out(self):
        # Genel "hekim" kelimesi bilerek işaretlere eklenmedi; aksi halde
        # personel ilanları yanlışlıkla A'ya düşerdi.
        decision = classify_for_queue(
            "legislation", "X İl Sağlık Müdürlüğünden: Sözleşmeli Aile Hekimi Alım İlanı", ""
        )
        self.assertEqual(decision.tier, "out")

    def test_gazette_personnel_notice_excluded_even_if_mentions_faculty(self):
        decision = classify_for_queue(
            "legislation",
            "X Üniversitesi Rektörlüğünden: Tıp Fakültesi Öğretim Üyesi Alımı İlanı",
            "",
        )
        self.assertEqual(decision.tier, "out")


if __name__ == "__main__":
    unittest.main()
