# Açık sorunlar listesi (2026-11-02)

Sahip: önce kaynak ekleme bitecek, sonra bu liste sırayla halledilecek. Durum: push ve deploy yapıldı (canlı `74234cc`).

## A. CI / otomatik denetim
1. **"Tıp Topluluğu sorun tespit listesi" iş akışı başarısız** (çalışma 41490063572, `e2ddd89`; script `tip_toplulugu_issue_check.py`). İki kontrol FAIL: **S01b** "rozet = görünen" (rozet 57, görünen 14) ve **S04b** "ileri tarihli kayıt yok" (10 kayıt). Canlı veri kaynaklı; kök neden incelenmedi.
2. **Worker tests** `e2ddd89` ve `89197d3` için "cancelled" (muhtemelen sonraki push ile iptal). `74234cc` çalışması sonuçlanınca doğrulanacak.
3. `74234cc` Worker testi yazıldığı anda `in_progress` idi; sonucu kontrol edilmedi.

## B. Yeni kaynaklar (12–17) eksikleri
4. **Güvenilir Gıda Kamuoyu Duyurusu** (sağlığı tehlikeye düşürecek gıda; taklit/tağşiş) listeleri POST ile yükleniyor, GET'te boş. Radar'a form-POST çekim türü ve gerçek uç nokta adresi gerekir.
5. **TUTD `/etkinlikler`**: kongre tek satır, tarih aralığı ("2 - 6 Aralık 2026"); otomatik alınmıyor.
6. **Sağlık Aktüel** bugünkü örnekte 0 kabul; verim izlenecek, kural gevşetilebilir.
7. **Kapasite**: geçmiş veri yok, koruma CAUTION (0,38 / hata-ağır 0,92). Kayıtlar `MANUAL_INTAKE` etiketli ama kapı testlerini geçtiği için zamanlanıyor; etiket ile davranış tutarsız (HSGM ve `titck_geri_cekme` de aynı).
8. TND liste sayfası ~1900 eski bağlantı taşıyor; her çalışmada ayrıştırılıyor (verim/maliyet).
9. İçerik kuralları anahtar kelime tabanlı; Medikal Akademi gibi karışık yayıncılarda yanlış eşleşme riski (ör. alt dizge). Telemetri ile izlenecek.

## C. Daha önceki kaynak işleri
10. **HSGM**: 30 bacak kayıtlı, üretimde Türkiye çıkışlı runner olmadan çekilemiyor (self-hosted `tr` runner + `TR_RUNNER_ENABLED=true` veya Windows görev zamanlayıcı; karar bekliyor).
11. **TÜİK** ana sayfa kaydırıcısı tarihsiz; dönem sonu tarihi yaklaşımı (sahip kararıyla bırakıldı).
12. **TİTCK** cihaz denetimi "KAMUOYUNUN DİKKATİNE" duyuruları yalnızca geri çekme kaynağıyla karşılanıyor.
13. ~~S66 ölü istisnalar~~ **Çözüldü (2026-11-03):** istisnaları kaldırmadan çalıştırınca yalnızca eutils, hsgm, noroloji, temd, tutd ihlal veriyordu; `ecdc.europa.eu`, `tuseb.gov.tr`, `who.int` `scripts/check_source_identity.py` içinden silindi (testler geçti).
14. `config/feeds.json` 729 eski `tip-*` satırı enabled gösteriyor: `scripts/sync-feeds.mjs` bilerek `enabled: true` yazar ("Hub registry stays enabled", yaml durumu `radarYamlEnabled` alanında), satırlar `ADAPTER_PUSH` olduğu için genel Kaduse alıcısı (`route = kaduse-news`) bunları çekmez. Üretilmiş eski çıktı; değiştirmek tohum SQL ve checkpoint testlerini etkiler, bu yüzden dokunulmadı (sahip kararı).
15. Emekli satırlar (mezar taşları) D1'de duruyor; silme yalnızca sahip onayıyla. Salt-okunur D1 kontrolü (2026-11-03): `news-titck-tibbi-cihaz-duyurulari` ve `news-titck-general-regulatory` enabled=0 (uygulanmış); `scripts/ops/2026-10-30-pending-...retire_aa_saglik_scoped.sql` ve `...retire_imdrf_news_whole.sql` dosyalarının satırları D1'de hiç yok (yalnız kapalı satır eklerdi), uygulanması gerekmez, dosyalar kayıt olarak duruyor.
16. Evergreen bounded executor son çalışmaları başarısızdı; son düzeltmeden sonra çalışması doğrulanmadı.
17. TÜSEB Duyuru sertifika sabitleme, ASHP `http_403`, AA Sağlık.

## D. Ertelenenler (sahibin listesi)
18. Zeynep Tartan kontrolü, HealthAI aylık rapor, doktor matrisi dosyaları, Sociality hesapları, Instagram Meta Graph API, doktorların sosyal medya girişi, OmniRoute kurulumu, kalan 41 Türk kaynak adayı listesi (çalışma alanında bulunamadı).

## E. Diğer dallar
19. Push/deploy edilmemiş yan dallar var (ör. `evergreen-activate-cleveland`, `evergreen-activate-cochrane`, `discovery/*`, `dossier/*`, `docs/release-record-*`); durumları bu oturumda doğrulanmadı.
