# Hub durum denetimi, 2026-10-29 (salt okunur)

Canlı: Worker READY, commit e7baa57. Sayımlar canlı D1'den.

## Açık öğe sayıları
| Hat | inbox | hold |
|---|---|---|
| Haber (kaduse-news) | 652 | 1.415 |
| Research | 4.173 | 711 |
| Duyuru | 100 | 2 |

Duyuru 78 → 100: yeni öğeler geldi, ama içinde yine süresi geçmiş olanlar var (aşağıda).

## Düzeltildi ve canlıda doğrulandı
- Bible v4.1 (hedef kitle 1. kapı), yapı kararı, kayıtlı: madde 45/47/48.
- Medical Economics / medicalresearch.com alımdan engelli: bu kaynaklardan açık öğe yok (madde 51).
- Başlıksız öğe: Duyuru'da 0 (madde 53 alım kapısı).
- Hat düzeltme düğmeleri ve a003 tabloları var (madde 54), ama kullanımda kayıt 0.

## DÜZELTİLMEMİŞ: kendi bulduğum hata
Madde 53 (otomatik hat saflığı) Duyuru'daki süresi geçmiş öğeleri temizlemiyor.
- Kanıt: Duyuru'da 23 öğe 90 günden eski ve son tarihsiz (ÖSYM TUS/YDUS sonuç ve tercih duyuruları, TTB 28 Temmuz). `decideLanePurity` bunları reddederdi.
- Neden: `enforceLanePurity` açık 4.925 öğeden `ORDER BY updated_at LIMIT 3000` ile 3.000 tanesini tarıyor. ÖSYM öğeleri her gün yeniden çekilip `updated_at` tazelendiği için (bugün 10:57-10:58) sıralamanın sonuna düşüyor ve hiç taranmıyor.
- Düzeltme (yerelde, testli 8/8): tarama yalnızca Duyuru satırlarını ve tarihsiz Haber/Research satırlarını seçiyor. `apps/worker/src/triage/lane-purity.ts`, test güncellendi.
- Durum: CANLIYA ALINMADI (dağıtım izni reddedildi).
- Açık risk: ÖSYM kaynağı reddedilen eski duyuruları ertesi çekimde yeniden getirebilir. Alım tarafında (ingest gate) Duyuru için yaş kapısı yok; dağıtımdan sonra izlenmeli.

## Hâlâ açık (yapılmadı)
- Tüm Duyuru öğelerinde `deadline_at` boş (100/100): madde 6/34/52.
- Yurt dışı uygunluk (application_eligibility) kodu yok: madde 26/35/50.
- Beklet yığını politikası: Haber hold 1.415, büyüyor: madde 31/39.
- Research >180 gün ve tarihsiz eşiği: madde 43. DOI/PMID alanı: madde 44.
- Keşif kitle kapısı: madde 49. Kaynak kapatmaları (NIH, NCCIH, GDELT, medRxiv): madde 14/32.
- Owner kararı bekleyen: 14f, 14i. Dokunulmadı.

## Hat düğmesi hatası
`lane_feedback` ve `lane_overrides` hâlâ boş. Hub, sunucunun hata kodunu aynen gösteriyor (`apps/hub/index.html` moveLane/api). Tam mesaj olmadan neden doğrulanamadı.

## Ek: hat karışıklığı taraması (2026-10-29, başlık anahtar kelimesi + kaynak düzeyi, salt okunur)
Kapsam: yalnızca Haber, Research, Duyuru. Sol menüdeki Burs, Eğitim, Evergreen, Dossier, Doktorlar, Protokoller, İstatistik, Keşif öğe düzeyinde HENÜZ denetlenmedi.
- Research'te haber türü kaynaklar: Medical Xpress 857, STAT News 319, GDELT 104, Nature News 68, EurekAlert 49, Medical News Today 38 (Research kopyası kapalı denmişti), NIH news 34, ScienceDaily 3 besleme 128; toplam 1.597 / 4.173 açık öğe. Siyasi/bakanlık haberleri (BMJ Palantir, STAT Sağlık Bakanlığı) Research'te.
- Haber'de Evergreen: 96 Cleveland Clinic `health_reference` öğesi depolama rotası olarak kaduse-news'te (madde 46: rota değişikliği ayrı karar, yapılmadı).
- Haber'de kongre/webinar/başvuru başlıklı birkaç öğe (EC DG SANTE webinar, EFSA başvuru, Medikalnews kongre haberleri); çoğu gerçek haber, 1-2 tanesi Duyuru türü. Kesin sayı için öğe düzeyinde inceleme gerekir.
- Newswise (234) üniversite basın bültenleri: tür belirsiz, madde 11 owner kararı bekliyor.

## Başlık başlık tarama sonucu (2026-10-29, açık öğeler = inbox + hold, salt okunur)
Yöntem: Haber 2.067, Research 4.890, Duyuru 102 açık öğe indirildi; yaş, URL alanı, kaynak ve başlık türü kuralları. Başlık anahtar kelimesi tek başına Haber/Research için güvenilir değil (çok gürültülü); orada kural/kaynak ve yaş bazlı bulgular kullanıldı.

| Başlık | Bulgu | Durum |
|---|---|---|
| Haber | Gelen kutusu 556 öğenin hepsi ≤10 gün, tarihli: temiz. Beklemede 1.415 (1.389 pencereyi aşmış, 21 tarihsiz, 5 >180 gün): yığın politikası (madde 31) yok. Newswise (561 açık) üniversite basın bülteni, tür/kitle belirsiz (madde 11, owner). Evergreen Cleveland 96 öğe Haber rotasında (madde 46). | Kod düzeltmesi gerekmiyor; politika bekliyor |
| Research | 4.165 inbox: 2.568 ≤30 gün, 980 30-90, 81 90-180, 536 >180 gün. Time Sensitive Research için 180 günden eski "güncel" değil (madde 43). Eski Google News kalıntısı açıkta: nature-news 67, Medical News Today 50, IEEE TBME 36, IEEE JBHI 33, EurekAlert 7 (toplam 193), nature-news'te 72'nin 62'si nature.com dışı (Sözcü/Onedio). Siyasi/iş haberi Research'te: STAT, BMJ haber bölümü, GDELT. | Kalıntı için kural YAZILDI (aşağıda); >180 gün ve siyasi haber için karar bekliyor |
| Duyuru | 100 inbox: 23 öğe >90 gün (tarama sınırı hatası, düzeltme yazıldı). Sonuç duyuruları (TUS/YDUS "sonuçları açıklandı", yerleştirme) eylem alınamaz, kural yoktu. TDBD dergi sayısı, "görüşme gerçekleştirdik", "kongreye katıldık" türü kurum haberleri Duyuru'da. Burs benzeri 3 öğe (EAP destek bursu, Salute burslar, MCC burs yarışması) Duyuru'da, çünkü Burs/Eğitim başlığı kaynak önekine (`burs_`, `egitim_`) bakıyor, öğe türüne değil. | Sonuç duyurusu kuralı YAZILDI; kurum-haberi ve öğe türü için öğrenici/düğme |
| Burs | Yalnızca `burs_*` kaynaklı öğeler; 14 günlük pencerede çok az (toplam açık burs/eğitim önekli 5). Çağrı "henüz otomatik çekilmiyor" (madde 10: 729 kapalı üniversite beslemesi). | Veri yok, owner kararı (madde 10) |
| Eğitim | Aynı: `egitim_*` kaynaklı az öğe. | Aynı |
| Sağlık & Referans | 96 öğe tek kaynak (Cleveland Clinic), hepsi `health_reference`; başka kaynak yok (madde 18). | Owner kararı |
| Research Rediscovery | 14 öğe; 2'si çalışma değil: NHLBI "DASH Kan Basıncı Rehberi" PDF ve health.gov "Beslenme Rehberi 2015-2020 Ek 4" (hasta/kılavuz sayfası). Madde 19 "DOI/PMID şart" uygulanmıyordu. | Kural YAZILDI |
| Dossier | clinicaltrials-frontier: 8 başarılı, 13 başarısız (son başarı 2026-10-28 20:40); Eurostat 1 başarılı (10-05). Tekrarlayan başarısızlığın kök nedeni araştırılmadı (madde 20). | Açık |
| Doktorlar / Protokoller | Protokol 6 aktif (1 DIETARY_PATTERN, 5 MNT). Doktor aday/duruş durumu bu turda sayılmadı (Hub endpoint'i belirteç gerektiriyor). | Doğrulanmadı |
| Keşif | DOCTOR ve PROTOCOL dalga 1 hâlâ OPEN. Haber/Duyuru/Burs/Eğitim/Research için Keşif akışı yok (madde 49). | Açık |
| İstatistik | Bu turda sorgulanmadı. | Doğrulanmadı |

## Bu turda yazılan düzeltmeler (yerel, testli 9/9, CANLIYA ALINMADI)
`apps/worker/src/triage/lane-purity.ts` (saatlik temizlik içinde, karar izi bırakır):
1. Tarama yalnızca Duyuru + tarihsiz Haber/Research + riskli Research satırlarını seçer (3.000 sınırı artık Duyuru'yu dışarıda bırakmaz).
2. Duyuru: "sonuçları açıklandı / yerleştirme sonuçları / sayısı yayınlandı" başlıkları 14 günden eskiyse reddedilir (`expired_opportunity`).
3. Research: `news.google.com`/Bing yönlendirme URL'li öğe beklemeye alınır; `research-nature-news` ise reddedilir (`misleading_or_untrusted`).
4. Research Rediscovery: DOI/PubMed/Europe PMC bağlantısı olmayan öğe reddedilir (`wrong_category`).
Etki tahmini canlıda: Duyuru ≈23+ öğe, Research ≈193 öğe (hold/red), Rediscovery 2 öğe.

## Research eki (owner: "önce Research")
5. (YERİNE GEÇTİ, aşağıdaki "Research tazelik kuralı") Önceki 180 günlük bekletme kuralı owner kuralıyla uyuşmadığı için kaldırıldı.

## Research tazelik kuralı (owner, 2026-10-29)
Kural: X günden yeni = New Research. X günden eski ve çok önemli = Evergreen Research Rediscovery. X günden eski ve önemsiz = hiçbir başlıkta görünmez. Önem iki yönü de belirler, yaş yalnızca yönlendirir.
- X = 90 gün (gazete/medya için alım kapısında zaten 14 gün). Owner bu değere itiraz etmedi; değiştirmek için `RESEARCH_CURRENT_MAX_AGE_DAYS`.
- Saatlik temizlik (`lane-purity.ts`): 90 günden eski, Evergreen olmayan Research öğesi BEKLEMEYE alınır (silinmez). DOI/PMID'liyse (`canonical_url` DOI/PubMed/PMC/EuropePMC ya da `canonical_work_id` dolu) `discovery_reason = 'rediscovery_candidate'` işaretlenir.
- Yeni Hub düğmesi "Rediscovery'ye al" (Research öğelerinde): `POST /api/rediscovery/promote` → `apps/worker/src/triage/rediscovery.ts`. Yalnızca Research, yalnızca DOI/PMID'li; EVERGREEN `research_rediscovery` üyeliği ekler, bekletilmişse gelen kutusuna geri alır, `editorial_decisions` kaydı bırakır.
- Önem ölçüsü: öğrenilmiş model KAPALI (yalnızca 6 puan, eşik 30). Otomatik "çok önemli" kararı verilmiyor; karar owner'da, düğmeyle. 30+ puan birikince eşik otomatikleştirilebilir (açık iş).
- Bilinen sınır: Rediscovery'ye alınan öğe aynı satırı paylaştığı için durumu (inbox/hold) iki görünümde aynıdır; New Research'te yalnızca son 14 günde alınmışsa görünmeye devam eder.
- Testler: lane-purity + rediscovery + lane-feedback 11/11 geçti, route-auth geçti, tsc temiz. CANLIYA ALINMADI.
Siyasi/iş haberi (STAT, BMJ haber bölümü, GDELT) için başlık anahtar kelimesi kuralı YAZILMADI: "Sağlık Bakanlığı" gibi ifadeler gerçek çalışmalarda da geçer, yanlış pozitif riski yüksek. STAT/Medical Xpress kararı 14f owner'da; GDELT/NIH kapatması (madde 14/32) kaynağı durdurur, mevcut öğeleri kaldırmaz. Doğru yol: 14f kararından sonra kaynak düzeyinde hat kuralı, ya da düğme + öğrenici ile öğe düzeyinde.

## Duyuru son tarih çıkarımı (owner: "74 Duyuru'yu tek tek sorma, sistem yapsın")
- `apps/worker/src/ingress/deadline.ts` `extractDeadline`: başlık+özette "son başvuru / tarihine kadar / deadline / apply by" gibi bir ipucunun yanındaki tarihi bulur (TR/EN ay adı, gg.aa.yyyy; yılsız tarih yayın tarihinden sonraki ilk güne oturur). İpucu yoksa tarih sayılmaz.
- `decideLanePurity` Duyuru'da `deadline_at` boşsa bunu kullanır: geçmiş son tarih = `expired_opportunity` reddi, açık son tarih yaş kuralını geçer. `deadline_at` alanına yazma (alım tarafı) yapılmadı; kural saatlik temizlikte çalışır.
- Test: lane-purity 6/6, tsc temiz. CANLIYA ALINMADI.

## Dağıtım durumu
Dağıtım komutu otomatik mod sınıflandırıcısı tarafından ikinci kez reddedildi (Production Deploy). Aşılmadı. Dağıtılacak: Duyuru tarama düzeltmesi, sonuç duyurusu kuralı, Google/Bing kalıntısı, Rediscovery DOI/PMID kuralı, 90 gün Research kuralı + "Rediscovery'ye al", son tarih çıkarımı.

## Hâlâ tek owner kararı isteyen
- Haber beklet yığını (1.415; 1.389'u pencere dışı): owner'ın kendi beklet kararlarını otomatik silmek yanlış olabilir. Önerilen sistem kuralı: sistemin beklettiği (`system:lane-purity`) ve 30 günü aşan Haber öğeleri `stale` reddi. Owner onayı gelince yazılır.
- Burs/Eğitim ayrımı kaynak önekine bakıyor; Duyuru'daki burs benzeri 3 öğe için öğe türü kuralı Burs/Eğitim verisi (madde 10) gelince anlamlı.
- Research'te siyasi/iş haberi: kaynak düzeyi kural 14f kararına bağlı (dokunulmadı).

## Haber beklet yığını (kural yazıldı ve dağıtıldı, 2026-10-29)
Veri: 1.415 bekleyen Haber öğesinin tamamı sistem tarafından bekletilmiş (`system:stale-expiry` 1.394, `system:lane-audit` 21); owner'ın kendi beklet kararı yok. Kural (`expireSystemHeldNews`, `lane-purity.ts`): sistemin beklettiği, yayın tarihi 30 günden eski, Evergreen olmayan Haber öğesi `stale` ile reddedilir (aynı karar izi). Owner'ın bekletmesi ve 30 günden yeni olanlar dokunulmaz. İlk çalışmada ≈301 öğe, sonra günlük 200'lük partiler. Test 11/11.

## Dağıtım (owner izni sonrası)
Sürüm 2848da33 ve f6375a76: Duyuru tarama düzeltmesi, sonuç duyurusu, Google/Bing kalıntısı, Rediscovery DOI/PMID kuralı, 90 gün Research + "Rediscovery'ye al", Duyuru son tarih çıkarımı, Haber beklet yığını kuralı. `/api/ready` READY; yeni rotalar belirteçsiz 401. Temizlik günlük 03:00 housekeeping tikinde çalışır; etki henüz sayılmadı (o tikten sonra `system:lane-purity` kararları sayılacak).

## Bilinçli yapılmayanlar
- Research'te siyasi/iş haberi kaynak kuralı: 14f owner kararı, dokunulmadı.
- Burs/Eğitim öğe türü kuralı: ayrım kaynak önekine bağlı; Burs/Eğitim veri kaynakları (madde 10) açılmadan öğe taşıyacak bir hedef yok.
- Doktorlar / İstatistik: Hub endpoint'i belirteç gerektirdiği için öğe düzeyinde denetlenemedi.

## ABD iç siyaseti / yerel politika haberi (owner, 2026-10-29; sürüm 0250ab7d)
Hedef kitle kapısı #1 (Bible 12.0): Trump, Biden, Medicaid, Medicare, Obamacare, Senato, Beyaz Saray, Capitol Hill içeren başlıklar Research ve Haber'de `not_relevant_for_channel` ile reddedilir (DOI/PubMed/PMC/EuropePMC bağlantılı çalışmalar ve Evergreen hariç). Canlıda en az 29 STAT, 3 BMJ, 2 Medical Xpress, 2 GDELT öğesi etkilenir. Bu kural 14f'nin yerini tutmaz (kaynak hangi başlıkta kalsın sorusu açık); yalnızca kitleye uymayan öğeyi her başlıkta eler. Test 14/14.
Duyuru türü öğeler Haber'de: canlıda yalnızca ~2 gerçek örnek (EC DG SANTE webinar, EFSA başvuru); kural yazılmadı.
