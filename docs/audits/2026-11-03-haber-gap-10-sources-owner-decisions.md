# 10 kaynak — sahip kararları (2026-11-03, taslak; kod/kayıt henüz değişmedi)

Kaynaklar: NTV Sağlık, BBC Türkçe Sağlık, DHA Sağlık-Yaşam, TTB, HASUDER, Türk Toraks, KLİMİK, TKD, TPD, TDB.
Dayanak: Bible v4 BÖLÜM 1, 2, 7, 12 ve SPF-3/6/7/8/10. Başlıklar 2026-11-03'te canlı yüzeylerden okundu.

## Genel basın (NTV, BBC, DHA) — hat: Haber
| Tür | Karar |
|---|---|
| Tek olay (hekime saldırı, ihmal iddiası) | RET |
| Ünlü/magazin sağlık | RET |
| Bilim temelli mit/gerçek açıklayıcı (BBC) | KABUL; sağlıkla bağı zayıf merak yazısı RET |
| Tek hasta/hastane başarı hikâyesi (DHA) | RET |
| Uzman uyarısı/röportaj | KABUL, yalnız adı geçen uzman; isimsiz RET; "çok genel" mevsimsel (grip) RET |
| Bakanlık/SGK: geri ödeme kararı, bakan konuşması | İKİSİ DE RET |
| Yurt dışı: veba küresel risk analizi, radyasyon kazası, Gazze fare istilası | KABUL |
| Yurt dışı: Papa ameliyatı, Rusya veba merkezi çalışan ölümü | RET |
| Bitkisel/şifa galerisi (NTV) | RET |
| NTV halk uyarısı: MHRS yeni hizmet | KABUL; sahte botoks alarmı RET |
| NTV bilim: Alzheimer proteini, gençlerde kanser artışı | KABUL; "ilaca yanıt vermeyen depresyon türü" RET |

## Dernekler (TTB, HASUDER, TTD, KLİMİK, TKD, TPD, TDB)
| Tür | Karar |
|---|---|
| TTB meslek hakları açıklaması | KABUL (Haber) |
| Özel gün/hafta bildirisi (Tromboz, Sepsis, Polio, Disleksi...) | KABUL; "dünya günü/farkındalık" dışlaması kalkar; yalnız "kutlu olsun" RET |
| Toplumsal olay bildirisi | Sağlık bağı varsa KABUL (maden/akciğer, iklim, tütün yasası); Gar katliamı yıldönümü, LGBTİ+, KHK paneli RET |
| Eğitim: tarihli webinar + kayıtlı ders/video | KABUL (Eğitim); firma akademisi (PCI Club Meril Academy) RET |
| Biten etkinlik | Sonuç/karar/bildirge varsa KABUL; yalnız "yapıldı/gerçekleşti" RET |
| KLİMİK kongre/sempozyum duyurusu | KABUL (Duyuru); kayıttaki dışlama kalkar |
| Üye avantajı (TÖMER, Petrol Ofisi kart, kredi) | RET |
| Kongre takvimi (TKD), yeterlik sınavı başvurusu (TPD) | KABUL |
| Dergi sayısı, haftalık bülten yayımlandı | RET |
| TDB: atama kurası ilanı, bilgilendirilmiş rıza yönetmeliği, TUK yürütmeyi durdurma | KABUL |
| TDB: kadro protestosu çağrısı, "DUS kılavuzuna dava açtık" | RET |
| Bayram kutlaması, başsağlığı, ziyaret, TDB Akademi "gerçekleştirildi" | RET (önceki sahip kuralları) |

## Teknik notlar
- NTV `saglik.rss` RSS değil Atom (`<entry>`); parser `<item>` bekliyorsa boş görünür. İncelenmeli.
- TDB sitesi React SPA; haberler `https://api.tdb.org.tr/news` (JSON) altından okunabiliyor. HTML list-page modu çalışmaz.
- Çözülecek çelişkiler: TTB "dava açtı" haberleri (meslek hakları KABUL) ile TDB "DUS davası açtık" (RET) tutarsız; NTV "131 ilaç geri ödeme" bakanlık kararı olarak RET.
- Hat atamaları (Haber/Duyuru/Eğitim) kaynak başına, kayıt kaynağı lane bazında (item bazında yeniden yönlendirme yok).
