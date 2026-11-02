"""Owner PASS/FAIL interview 2026-11-03 (Bible 26.1) for NTV, BBC, DHA, TTB, HASUDER, TTD, KLİMİK, TKD, TPD, TDB.

Every row is a real title read live on 2026-11-03 with the owner's answer for that content type
(docs/audits/2026-11-03-haber-gap-10-sources-owner-decisions.md). Undecided types stay DISCARD.
"""
from __future__ import annotations

import unittest

from radar.tip_toplulugu_continuous_runner import export_automation_ready_profiles
from radar.tip_toplulugu_fetch import classify_with_congress_gate

PROFILES = {p["source_id"]: p for p in export_automation_ready_profiles()}
A, D = "ACCEPT", "DISCARD"

CASES = [
    # --- NTV Sağlık (Haber) ---
    ("ntv_saglik", "131 ilaç daha geri ödeme listesine alındı. 6'sı kanser ilacı", "", D),
    ("ntv_saglik", "Alzheimer'da gençlik proteini keşfi", "", A),
    ("ntv_saglik", "Gençlerde kanser alarmı: 7 kanser türünde dikkat çeken artış", "", A),
    ("ntv_saglik", "Anne adayları dikkat, artık MHRS'den randevu alınabiliyor", "", A),
    ("ntv_saglik", "İlaçlara yanıt vermeyen yeni bir depresyon türü tespit edildi", "", D),
    ("ntv_saglik", "Antalya'da sahte botoks alarmı. 16 kişi hastanelik oldu, 3'ü yoğun bakımda", "", D),
    ("ntv_saglik", "Havalar soğudu, grip vakaları arttı. Uzmanı uyardı: Bir haftayı geçiyorsa dikkat", "", D),
    ("ntv_saglik", "Tansiyon, şeker ve kolesterole iyi geliyormuş. Kurutularak çay gibi içiliyor", "", D),
    ("ntv_saglik", "Süper meyve toprakla buluştu, şifa dağıtıyor. Antioksidan değeri yüksek", "", D),
    ("ntv_saglik", "Bir yılda 50 kilo verdi. Yoğun iş temposu iğne ipliğe çevirdi", "", D),
    # --- BBC Türkçe Sağlık (Haber) ---
    ("bbc_turkce_saglik", "Keten tohumu gerçekten sağlığa faydalı mı, bilim ne diyor?", "", A),
    ("bbc_turkce_saglik", "Çiğ sütün sağlığa faydalı olduğu doğru mu, içmek güvenli mi?", "", A),
    ("bbc_turkce_saglik", "'Ferritin yüzü': Demir eksikliği dış görünüşten anlaşılabilir mi?", "", A),
    ("bbc_turkce_saglik", "Hayalet görmek ve yanında bir varlık hissetmek: Paranormal deneyimler neden yaşanır?", "", D),
    ("bbc_turkce_saglik", "Bir video oyunuyla partnerinizi aldatabilir misiniz?", "", D),
    ("bbc_turkce_saglik", "Papa 14. Leo akciğer kanseri ameliyatı oldu", "", D),
    ("bbc_turkce_saglik", "Rusya'da veba araştırma merkezindeki çalışanın ölümüyle ilgili neler biliniyor?", "", D),
    ("bbc_turkce_saglik", "Veba salgınının küresel çapta yaşanması mümkün mü?", "", A),
    ("bbc_turkce_saglik", "Brezilya'nın en kötü radyasyon kazasının anıları", "", A),
    ("bbc_turkce_saglik", "Gazze'de geçen yaz: Fare istilasındaki kamplar ve iyileşmeyen yaralar", "", A),
    # --- DHA Sağlık-Yaşam (Haber) ---
    ("dha_saglik_yasam", "12 yıldır kasık ve karın ağrısı çeken hasta robotik cerrahiyle sağlığına kavuştu", "", D),
    ("dha_saglik_yasam", "Babasından kök hücre nakli ile lösemiyi yendi", "", D),
    ("dha_saglik_yasam", "Bakan Işıkhan: 131 ilacı daha geri ödeme listesine aldık", "", D),
    ("dha_saglik_yasam", "Bakan Memişoğlu: Tütün her yıl 100 binden fazla insanımızın hayatına mal oluyor", "", D),
    ("dha_saglik_yasam", "İki baba, birbirinin çocuklarına böbreklerini verdi", "", D),
    ("dha_saglik_yasam", "‘Soğuk havalarda RSV, bebeklerde ciddi sağlık sorunlarına yol açabiliyor’", "Prof. Dr. Ayşe Yılmaz, RSV hakkında uyardı.", A),
    # --- TTB ---
    ("ttb_meslek_haklari", "TTB Aile Hekimliği Kolu 2027-2028 Dönemi Sözleşme Taleplerini Paylaştı: Güçlü Birinci Basamak, Güvenceli Çalışma!", "", A),
    ("ttb_meslek_haklari", "TTB, Bireysel Hedef Katsayısının İptali İstemiyle Dava Açtı: Kamu Sağlığını Tehdit Etmekte", "", D),
    ("ttb_meslek_haklari", "TTB’nin Açtığı Davada, Ayakta Teşhis ve Tedavi Yapılan Özel Sağlık Kuruluşları Hakkında Yönetmeliğin Hekimlerin Çalışma Hakkını Kısıtlayan Kimi Hükümlerinin Yürütmesi Durduruldu", "", A),
    ("ttb_meslek_haklari", "Cumhuriyet’in 103. Yılı Kutlu Olsun", "", D),
    ("ttb_meslek_haklari", "TTB-Petrol Ofisi Positive Kart Anlaşmasında Güncelleme", "", D),
    ("ttb_meslek_haklari", "TTB-TÖMER Arasında İşbirliği: Tabip Odalarının Üyeleri İçin İndirimli Dil Eğitimi İmkanı", "", D),
    ("egitim_ttb", "XXXII. Tıpta Uzmanlık Eğitimi Kurultayı", "", A),
    ("egitim_ttb", "Prof. Dr. Nusret Fişek Etkinlikleri / Panel | Kanser ve Toplumsal Eşitsizlikler", "", A),
    # --- HASUDER ---
    ("hasuder_duyuru", "HALK SAĞLIĞI YETERLİK SINAVI DUYURUSU 2026", "", A),
    ("hasuder_duyuru", "2025 UHSK KONGRE SONUÇ BİLDİRGESİ YAYIMLANDI!", "", A),
    ("hasuder_ozelgun", "10 EKİM DÜNYA RUH SAĞLIĞI GÜNÜ", "", A),
    ("hasuder_ozelgun", "DİSLEKSİ HAFTASI: FARKINDALIK VE DESTEK", "", A),
    ("hasuder_ozelgun", "6 EKİM DÜNYA SEREBRAL PALSİ GÜNÜ BİLGİ NOTU", "", A),
    # --- Türk Toraks ---
    ("ttd_ozelgun", "Türk Toraks Derneği Klinik Sorunlar Çalışma Grubu \"13 Ekim Dünya Tromboz Günü\" Basın Bildirisi", "", A),
    ("ttd_ozelgun", "Türk Toraks Derneği Mesleksel Akciğer Hastalıkları Çalışma Grubu “Soma’da Yaşanan Maden Göçüğü Üzerine” Basın Bildirisi", "", A),
    ("ttd_ozelgun", "10 Uzmanlık Derneğinin Ortak İmzasıyla Yeni Tütün Kontrolü Yasasına İlişkin Kamuoyuna Açık Mektubumuz", "", A),
    ("ttd_ozelgun", "29 Ekim Cumhuriyet Bayramımız Kutlu Olsun", "", D),
    ("egitim_ttd", "Pnömokok Aşılamasında Güncel Yaklaşım: Kime, Ne Zaman, Hangi Aşı?", "", A),
    ("egitim_ttd", "Türk Toraks Derneği SEATS 2026 ve MLCC 2026 Kongrelerini Endorse Etti", "", A),
    # --- KLİMİK ---
    ("egitim_klimik", "KLİMİK Video: İki Ajanlı Antiretroviral Tedavi: Kime, Ne Zaman?", "", A),
    ("egitim_klimik", "AGUH 2026 Temel Eğitim Programı (16-17 Ekim 2026, İstanbul) Yapıldı", "", D),
    ("egitim_klimik", "Haftalık KLİMİK Bülteni’nin Son Sayısı (27 Ekim 2026) Yayımlandı", "", D),
    ("klimik_ozelgun", "Bugün 24 Ekim 2026 Dünya Polio Günü", "", A),
    ("klimik_ozelgun", "28 Ekim 2026 Türkiye Cumhuriyeti 103 Yaşında!", "", D),
    # --- TKD ---
    ("egitim_tkd", "TKD Webinar // Zero-Fluoroscopy Ablasyon İpuçları", "", A),
    ("egitim_tkd", "2027 Ulusal Kongre ve Bilimsel Toplantılar Takvimi", "", A),
    ("egitim_tkd", "PCI Club Meril Academy", "", D),
    ("egitim_tkd", "Vefat ve Başsağlığı", "", D),
    # --- TPD ---
    ("tpd_duyuru", "20. Psikiyatri Yeterlik Sınavı Uygulama Sınavı Başvuruları Devam Ediyor!", "", A),
    ("egitim_tpd", "TPD 62. Ulusal Psikiyatri Kongresi 14-18 Ekim 2026 tarihleri arasında Ankara’da gerçekleşti!", "", D),
    ("tpd_ozelgun", "10 Ekim Dünya Ruh Sağlığı Günü Ortak Açıklaması", "", A),
    ("tpd_ozelgun", "10 Ekim Ankara Gar Katliamı’nın 11. Yılında Yasımız ve Adalet Talebimiz Sürüyor.", "", D),
    ("tpd_ozelgun", "Avrupa Psikiyatri Birliği (EPA): Türkiye’de LGBTİ+ Bireyleri ve Ruh Sağlığı Profesyonellerini Etkileyen Son Gelişmelere İlişkin Açıklama", "", D),
    # --- TDB (JSON API record) ---
    ("tdb_dental", "T.C. SAĞLIK BAKANLIĞI 2026 Yılı 3.Dönem İlk Defa ve Yeniden Atama Kurası İlanı Yayınlandı", "", A),
    ("tdb_dental", "BİLGİLENDİRİLMİŞ RIZANIN ELEKTRONİK ORTAMDA ALINMASINA İLİŞKİN YÖNETMELİK YAYIMLANDI", "", A),
    ("tdb_dental", "TDB GENEL BAŞKANI: \"Açıklanan kadro sayılarını yetersiz buluyor ve protesto ediyoruz\"", "", D),
    ("tdb_dental", "DUS BAŞVURU KILAVUZU’NA DAVA AÇTIK", "", D),
    ("tdb_dental", "TÜRK DİŞHEKİMLERİ BİRLİĞİ’NİN AÇTIĞI DAVADA DOKTORALI DİŞHEKİMLERİNE UZMANLIK BELGESİ VERİLMESİNE İLİŞKİN TUK KARARININ YÜRÜTMESİ DURDURULDU", "", D),
    ("tdb_dental", "TDBD 229. SAYI YAYIMLANDI", "", D),
    ("tdb_dental", "TDB AKADEMİ & ÇANAKKALE DİŞHEKİMLERİ ODASI BİLİMSEL ETKİNLİĞİ GERÇEKLEŞTİRİLDİ", "", D),
    ("tdb_dental", "TDB ÜYELERİNE ÖZEL, %2,33’TEN BAŞLAYAN FAİZ ORANLARI ING KAZANÇLI KREDİ’DE", "", D),
]


class GapSourceOwnerDecisions(unittest.TestCase):
    def test_every_owner_answer_on_a_real_title(self):
        wrong = []
        for sid, title, body, want in CASES:
            self.assertIn(sid, PROFILES, sid)
            got = classify_with_congress_gate(PROFILES[sid], title=title, body=body).decision
            if got != want:
                wrong.append(f"{sid}: want {want} got {got} :: {title[:90]}")
        self.assertEqual(wrong, [], "\n" + "\n".join(wrong))


if __name__ == "__main__":
    unittest.main()
